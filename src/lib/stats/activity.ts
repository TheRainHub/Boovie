"use client";

/**
 * Listening and reading statistics. Time is gathered in memory as it happens and added to daily rows per book
 * (`activity` table) every few seconds. When the app is hidden, whatever isn't written yet is also copied to
 * localStorage (an IndexedDB write may be cut off then) and added back on the next start.
 */
import { currentOwner, deviceId, GUEST } from "../account/identity";
import { getDB } from "../storage/db";
import type { ActivityKind, ActivityRecord, BookRecord } from "../storage/types";

interface Pending {
  bookId: string;
  kind: ActivityKind;
  seconds: number;
  pages: number;
  audioSeconds: number;
  finished: boolean;
}

const PENDING_KEY = "boowie-activity-pending";
const MOVED_KEY = "boowie-activity-moved";
const FLUSH_MS = 15_000;

let pending = new Map<string, Pending>();
let timer: ReturnType<typeof setInterval> | null = null;
let flushing: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Called after rows were written (the account sync uploads them). */
export function onActivityWritten(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The same book on any device: store books by their catalog id, files by title, author and medium. */
export function bookKey(book: Pick<BookRecord, "storeId" | "title" | "author" | "format">): string {
  const medium = book.format === "audio" ? "audio" : "text";
  return book.storeId ? `store:${book.storeId}` : `local:${norm(book.title)}|${norm(book.author)}|${medium}`;
}

export function dayKey(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function rowId(owner: string, device: string, day: string, key: string, kind: ActivityKind): string {
  return `${owner}|${device}|${day}|${key}|${kind}`;
}

function add(bookId: string, kind: ActivityKind, patch: Partial<Omit<Pending, "bookId" | "kind">>): void {
  const k = `${bookId}|${kind}`;
  const cur = pending.get(k) ?? { bookId, kind, seconds: 0, pages: 0, audioSeconds: 0, finished: false };
  cur.seconds += patch.seconds ?? 0;
  cur.pages += patch.pages ?? 0;
  cur.audioSeconds += patch.audioSeconds ?? 0;
  cur.finished ||= !!patch.finished;
  pending.set(k, cur);
  if (!timer && typeof window !== "undefined") timer = setInterval(() => void flushActivity(), FLUSH_MS);
}

/** Playback moved forward by `audioSeconds` of the book, which took `seconds` of real time. */
export function recordListen(bookId: string, seconds: number, audioSeconds: number): void {
  if (seconds > 0) add(bookId, "listen", { seconds, audioSeconds });
}

export function recordReading(bookId: string, seconds: number): void {
  if (seconds > 0) add(bookId, "read", { seconds });
}

export function recordPage(bookId: string, pages = 1): void {
  add(bookId, "read", { pages });
}

/** The book was read or listened to the end (counted once per book). */
export function recordFinish(bookId: string, kind: ActivityKind): void {
  add(bookId, kind, { finished: true });
  void flushActivity();
}

/** Write what has been gathered into today's rows. */
export function flushActivity(): Promise<void> {
  if (flushing) return flushing.then(() => flushActivity());
  if (!pending.size) return Promise.resolve();
  const batch = pending;
  pending = new Map();
  flushing = write([...batch.values()])
    .catch(() => {
      // Put it back for the next try.
      for (const p of batch.values()) add(p.bookId, p.kind, p);
    })
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function write(items: Pending[]): Promise<void> {
  const db = getDB();
  const owner = currentOwner();
  const device = deviceId();
  const day = dayKey();
  const books = new Map((await db.books.bulkGet([...new Set(items.map((i) => i.bookId))])).filter(Boolean).map((b) => [b!.id, b!]));
  await db.transaction("rw", db.activity, async () => {
    for (const it of items) {
      const book = books.get(it.bookId);
      if (!book) continue;
      const key = bookKey(book);
      // A book counts as finished once, on the first day it was finished.
      const finished = it.finished && !(await db.activity.where("[owner+bookKey]").equals([owner, key]).filter((r) => r.kind === it.kind && r.finished).count());
      const id = rowId(owner, device, day, key, it.kind);
      const cur = await db.activity.get(id);
      const row: ActivityRecord = {
        id,
        owner,
        deviceId: device,
        day,
        bookKey: key,
        kind: it.kind,
        title: book.title,
        author: book.author,
        seconds: (cur?.seconds ?? 0) + Math.round(it.seconds),
        pages: (cur?.pages ?? 0) + it.pages,
        audioSeconds: (cur?.audioSeconds ?? 0) + Math.round(it.audioSeconds),
        finished: !!cur?.finished || finished,
        updatedAt: Date.now(),
        syncedAt: cur?.syncedAt,
      };
      await db.activity.put(row);
    }
  });
  for (const fn of listeners) fn();
}

/**
 * The app is being hidden (and may be closed without notice): move what isn't written yet into localStorage,
 * synchronously. It lives in exactly one place — memory or the stash — so nothing is counted twice; the stash
 * is written to the database when the app is back (`restoreStashedActivity`).
 */
export function stashActivity(): void {
  if (!pending.size) return;
  try {
    const prev = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "[]") as Pending[];
    localStorage.setItem(PENDING_KEY, JSON.stringify([...prev, ...pending.values()]));
    pending = new Map();
  } catch {
    // No storage: try the database instead.
    void flushActivity();
  }
}

/** At start and when the app is visible again: take the stash back and write it. */
export function restoreStashedActivity(): void {
  let items: Pending[] = [];
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_KEY);
    items = JSON.parse(raw) as Pending[];
  } catch {
    return;
  }
  for (const p of items) add(p.bookId, p.kind, p);
  void flushActivity();
}

/** Books finished before statistics existed (progress at 100 %) are counted as finished once. */
export async function backfillFinished(): Promise<void> {
  const db = getDB();
  const done = (await db.progress.toArray()).filter((p) => p.percentage >= 99.5);
  for (const p of done) {
    const book = await db.books.get(p.bookId);
    if (!book) continue;
    const kind: ActivityKind = book.format === "audio" ? "listen" : "read";
    const known = await db.activity.where("[owner+bookKey]").equals([currentOwner(), bookKey(book)]).filter((r) => r.kind === kind && r.finished).count();
    if (!known) add(book.id, kind, { finished: true });
  }
  await flushActivity();
}

/**
 * A book was renamed: this device's rows follow it to its new key and title (added to rows already there), unless
 * another book in the library still has the old key and the time can't be told apart. Rows uploaded under the old
 * key are removed from the account at the next sync (`movedBookKeys`).
 */
export async function renameBookActivity(before: BookRecord, after: BookRecord): Promise<void> {
  await flushActivity();
  const db = getDB();
  const from = bookKey(before);
  const to = bookKey(after);
  if (from !== to && (await db.books.toArray()).some((b) => b.id !== after.id && bookKey(b) === from)) return;
  const owner = currentOwner();
  const device = deviceId();
  let uploaded = false;
  await db.transaction("rw", db.activity, async () => {
    const owners = owner === GUEST ? [GUEST] : [owner, GUEST];
    const rows = await db.activity.where("[owner+bookKey]").anyOf(owners.map((o) => [o, from])).filter((r) => r.deviceId === device).toArray();
    for (const r of rows) {
      const id = rowId(r.owner, device, r.day, to, r.kind);
      const cur = id === r.id ? undefined : await db.activity.get(id);
      if (id !== r.id) {
        uploaded ||= !!r.syncedAt;
        await db.activity.delete(r.id);
      }
      await db.activity.put({
        ...r,
        id,
        bookKey: to,
        title: after.title,
        author: after.author,
        seconds: (cur?.seconds ?? 0) + r.seconds,
        pages: (cur?.pages ?? 0) + r.pages,
        audioSeconds: (cur?.audioSeconds ?? 0) + r.audioSeconds,
        finished: !!cur?.finished || r.finished,
        updatedAt: Date.now(),
        syncedAt: id === r.id ? r.syncedAt : cur?.syncedAt,
      });
    }
  });
  if (uploaded && owner !== GUEST) {
    try {
      const moved = JSON.parse(localStorage.getItem(MOVED_KEY) ?? "[]") as { owner: string; key: string }[];
      localStorage.setItem(MOVED_KEY, JSON.stringify([...moved, { owner, key: from }]));
    } catch {
      /* the old rows stay in the account under the old name */
    }
  }
  for (const fn of listeners) fn();
}

/** Book keys whose rows from this device the account should drop (the book was renamed). */
export function movedBookKeys(owner: string): string[] {
  try {
    return (JSON.parse(localStorage.getItem(MOVED_KEY) ?? "[]") as { owner: string; key: string }[]).filter((m) => m.owner === owner).map((m) => m.key);
  } catch {
    return [];
  }
}

export function forgetMovedBookKeys(owner: string, keys: string[]): void {
  try {
    const moved = JSON.parse(localStorage.getItem(MOVED_KEY) ?? "[]") as { owner: string; key: string }[];
    const left = moved.filter((m) => m.owner !== owner || !keys.includes(m.key));
    if (left.length) localStorage.setItem(MOVED_KEY, JSON.stringify(left));
    else localStorage.removeItem(MOVED_KEY);
  } catch {
    /* ignore */
  }
}

"use client";

/**
 * The library of an account, on the device. Every book has a key that is the same on all devices (`syncKey`):
 *  - `store:<id>` — a store book; another device downloads it from the store;
 *  - `librarr:<entry id>` — a book from the user's Librarr; another device downloads it from there;
 *  - `voice:<key of the text>` — an audiobook voiced with ElevenLabs on this device;
 *  - `file:<format>:<size>:<hash of the first 64 KB>` — the user's own file; the same file added on two devices
 *    gets the same key, so they are one book in the account.
 *
 * The account's copy of each book (its entry and progress) is kept in the `cloud` table, so the library can show
 * the account's books that aren't on this device, offline too. Nothing here talks to the server: account/
 * librarySync.ts uploads and downloads, at the moments it chooses (see there).
 */
import { useLiveQuery } from "dexie-react-hooks";
import { create } from "zustand";
import { GUEST, useIdentity } from "../account/identity";
import { fileHead } from "../storage/blobStore";
import { getDB } from "../storage/db";
import type { Bookmark, BookRecord, CloudEntry, CloudProgress, CloudRecord, ProgressRecord } from "../storage/types";
import { renameBookActivity } from "../stats/activity";

const HEAD = 64 * 1024;

// ── Keys ──────────────────────────────────────────────────────────────────────────────────

/** A short hash of the bytes: SHA-256 where the page may use it, otherwise FNV-1a (plain-http development). */
async function shortHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

/** The key of a user's file: its format, total size and the first bytes of its first file. */
export async function contentKey(format: string, size: number, head: Blob): Promise<string> {
  const bytes = new Uint8Array(await head.slice(0, HEAD).arrayBuffer());
  return `file:${format}:${size}:${await shortHash(bytes)}`;
}

/** Librarr downloads made before books carried their source: entry id → book id (Librarr settings). */
function librarrOwned(): Map<string, string> {
  try {
    const owned = (JSON.parse(localStorage.getItem("boowie-librarr") ?? "{}") as { state?: { owned?: Record<string, string> } }).state?.owned ?? {};
    return new Map(Object.entries(owned).map(([entry, book]) => [book, entry]));
  } catch {
    return new Map();
  }
}

/** The book's key, worked out (from its first file) for books added before keys existed. */
export async function keyForBook(book: BookRecord, owned = librarrOwned()): Promise<string | undefined> {
  if (book.syncKey) return book.syncKey;
  if (book.storeId) return `store:${book.storeId}`;
  if (book.source?.kind === "librarr") return `librarr:${book.source.entryId}`;
  const entry = owned.get(book.id);
  if (entry) return `librarr:${entry}`;
  const first = book.sourceFileIds[0];
  const head = first ? await fileHead(first, HEAD).catch(() => null) : null;
  return head ? contentKey(book.format, book.fileSize, head) : undefined;
}

/** Give every book of the library its key (once; new books get theirs when they are saved). */
export async function ensureSyncKeys(): Promise<void> {
  const db = getDB();
  const missing = await db.books.filter((b) => !b.syncKey).toArray();
  if (!missing.length) return;
  const owned = librarrOwned();
  for (const book of missing) {
    const key = await keyForBook(book, owned);
    if (key) await db.books.update(book.id, { syncKey: key });
  }
}

// ── The account's copy ──────────────────────────────────────────────────────────────────

/** The signed-in account, or null for a guest. */
function owner(): string | null {
  return useIdentity.getState().user?.id ?? null;
}

export const cloudId = (owner: string, key: string) => `${owner}|${key}`;

/** The account's books that aren't on this device (newest first). */
export function useCloudShelf(): CloudEntry[] | undefined {
  const user = useIdentity((s) => s.user?.id ?? GUEST);
  return useLiveQuery(async () => {
    if (user === GUEST) return [];
    const db = getDB();
    const [rows, books] = await Promise.all([db.cloud.where("owner").equals(user).toArray(), db.books.toArray()]);
    const here = new Set(books.map((b) => b.syncKey).filter(Boolean));
    return rows
      .flatMap((r) => (r.entry && !r.entry.deleted && !here.has(r.key) ? [r.entry] : []))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [user]);
}

// ── Deletions ────────────────────────────────────────────────────────────────────────────

const DELETED_KEY = "boowie-cloud-deleted";
type Deletion = Pick<CloudEntry, "key" | "kind" | "format" | "title" | "author"> & { owner: string; at: number };

function readDeletions(): Deletion[] {
  try {
    return JSON.parse(localStorage.getItem(DELETED_KEY) ?? "[]") as Deletion[];
  } catch {
    return [];
  }
}

export function entryKind(key: string): CloudEntry["kind"] {
  return key.startsWith("store:") ? "store" : key.startsWith("librarr:") ? "librarr" : "file";
}

/** The book is to leave the account too: remembered until the next upload, and taken off the shelf at once. */
export async function removeFromAccount(book: Pick<CloudEntry, "key" | "format" | "title" | "author">): Promise<void> {
  const user = owner();
  if (!user) return;
  const at = Date.now();
  try {
    const rest = readDeletions().filter((d) => !(d.owner === user && d.key === book.key));
    localStorage.setItem(DELETED_KEY, JSON.stringify([...rest, { owner: user, key: book.key, kind: entryKind(book.key), format: book.format, title: book.title, author: book.author, at }]));
  } catch {
    /* storage blocked: the book stays in the account */
  }
  const db = getDB();
  const id = cloudId(user, book.key);
  const row = await db.cloud.get(id);
  if (row?.entry) await db.cloud.put({ ...row, entry: { ...row.entry, deleted: true, updatedAt: at } });
}

/** Deletions waiting for the upload, and a way to forget them once it went through. */
export function pendingDeletions(user: string): { items: Deletion[]; done: () => void } {
  const items = readDeletions().filter((d) => d.owner === user);
  return {
    items,
    done: () => {
      try {
        const sent = new Set(items.map((d) => `${d.key}|${d.at}`));
        localStorage.setItem(DELETED_KEY, JSON.stringify(readDeletions().filter((d) => !sent.has(`${d.key}|${d.at}`))));
      } catch {
        /* ignore */
      }
    },
  };
}

// ── Taking the account's state ──────────────────────────────────────────────────────────

/** The account's title, author, narrator and chapter titles, when they are newer than this device's. */
export async function applyEntry(book: BookRecord, entry: CloudEntry): Promise<void> {
  const db = getDB();
  if (book.infoUpdatedAt !== undefined && book.infoUpdatedAt >= entry.updatedAt) return;
  const after: BookRecord = { ...book, title: entry.title || book.title, author: entry.author || book.author, narrator: entry.narrator || book.narrator };
  const chapters = entry.editedChapters ?? {};
  await db.transaction("rw", db.books, db.chapters, async () => {
    await db.books.update(book.id, {
      title: after.title,
      author: after.author,
      narrator: after.narrator,
      editedChapters: entry.editedChapters,
      infoUpdatedAt: entry.updatedAt,
      syncedAt: entry.updatedAt,
    });
    for (const [index, title] of Object.entries(chapters)) await db.chapters.update(`${book.id}:${index}`, { title });
  });
  if (book.title !== after.title || book.author !== after.author) await renameBookActivity(book, after);
}

/**
 * A screen showing the book can take a newer place from another device itself: the open reader offers to go there,
 * the player moves when it is paused and keeps its own place while it plays. Returns true when it did, so the
 * position isn't written underneath it.
 */
type PositionClaim = (bookId: string, progress: CloudProgress) => boolean;
const claims = new Set<PositionClaim>();

export function claimRemotePositions(fn: PositionClaim): () => void {
  claims.add(fn);
  return () => void claims.delete(fn);
}

function mergeBookmarks(a: Bookmark[], b: Bookmark[], removed: Set<string>): Bookmark[] {
  const byId = new Map<string, Bookmark>();
  for (const bm of [...a, ...b]) if (!removed.has(bm.id) && !byId.has(bm.id)) byId.set(bm.id, bm);
  return [...byId.values()].sort((x, y) => x.createdAt - y.createdAt);
}

const sameIds = (a: { id: string }[], b: { id: string }[]) => a.length === b.length && a.every((x, i) => x.id === b[i].id);
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * Merge the account's progress into the book's: the newer place wins, bookmarks and finished chapters add up
 * (a bookmark deleted on either side stays deleted). Marks what the account still lacks for the next upload.
 */
export async function applyProgress(bookId: string, remote: CloudProgress): Promise<void> {
  const db = getDB();
  const local: ProgressRecord = (await db.progress.get(bookId)) ?? {
    bookId, currentChapterIndex: 0, scrollOffsetOrPage: 0, audioTimestamp: 0, percentage: 0, updatedAt: 0, bookmarks: [], completedChapters: [],
  };
  const removed = new Set([...(local.removedBookmarks ?? []), ...remote.removedBookmarks]);
  const bookmarks = mergeBookmarks(local.bookmarks, remote.bookmarks, removed);
  const completedChapters = [...new Set([...(local.completedChapters ?? []), ...remote.completedChapters])].sort((a, b) => a - b);
  const removedBookmarks = [...removed];
  // The account lacks something this device has: upload the merged state next time.
  const accountBehind = !sameIds(bookmarks, remote.bookmarks) || !sameSet(completedChapters, remote.completedChapters) || removedBookmarks.length !== remote.removedBookmarks.length;

  const remoteNewer = remote.updatedAt > local.updatedAt;
  const claimed = remoteNewer && [...claims].some((claim) => claim(bookId, remote));
  if (remoteNewer && !claimed) {
    await db.progress.put({
      ...local,
      currentChapterIndex: remote.currentChapterIndex,
      scrollOffsetOrPage: remote.scrollOffsetOrPage,
      audioTimestamp: remote.audioTimestamp,
      percentage: remote.percentage,
      bookmarks,
      completedChapters,
      removedBookmarks,
      updatedAt: remote.updatedAt,
      syncedAt: accountBehind ? remote.updatedAt - 1 : remote.updatedAt,
    });
  } else if (!sameIds(bookmarks, local.bookmarks) || !sameSet(completedChapters, local.completedChapters ?? []) || removedBookmarks.length !== (local.removedBookmarks ?? []).length) {
    // Keep this device's place (newer, or taken care of by the screen) and its time; add what the account had.
    await db.progress.put({ ...local, bookmarks, completedChapters, removedBookmarks, syncedAt: accountBehind ? Math.min(local.syncedAt ?? 0, local.updatedAt - 1) : local.syncedAt });
  } else if (!remoteNewer && accountBehind && local.syncedAt === local.updatedAt) {
    await db.progress.update(bookId, { syncedAt: local.updatedAt - 1 });
  }
}

/** A book just added on this device that the account already knows: its names, edits and place come along. */
export async function adoptCloudState(bookId: string): Promise<void> {
  const user = owner();
  if (!user) return;
  const db = getDB();
  const book = await db.books.get(bookId);
  if (!book?.syncKey) return;
  const row: CloudRecord | undefined = await db.cloud.get(cloudId(user, book.syncKey));
  if (row?.entry && !row.entry.deleted) await applyEntry(book, row.entry);
  if (row?.progress) await applyProgress(bookId, row.progress);
}

// ── New books ──────────────────────────────────────────────────────────────────────────

const addedListeners = new Set<() => void>();

/** Called after a book was added on this device (its own files may need to go to the cloud). */
export function onBookAdded(fn: () => void): () => void {
  addedListeners.add(fn);
  return () => void addedListeners.delete(fn);
}

export function notifyBookAdded(): void {
  for (const fn of addedListeners) fn();
}

// ── The open reader's question ─────────────────────────────────────────────────────────

/** A newer place from another device for the book open in the reader: the reader asks whether to go there. */
export const useRemoteJump = create<{ bookId: string | null; progress: CloudProgress | null }>(() => ({ bookId: null, progress: null }));

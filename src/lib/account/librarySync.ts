"use client";

/**
 * The library and the reading places of an account on the server (Supabase tables `library` and `progress`, see
 * supabase/schema.sql). The device works with its own database all the time; the server is asked as seldom as
 * possible (session.ts decides when: when the app leaves the screen, when playback pauses, when the app opens):
 *  - upload: only books and places that changed since the last upload, in one request per table;
 *  - download: only rows the server got since the last download (`synced_at`, set by the server), so an unchanged
 *    library costs two empty answers.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { unloadIfCurrent } from "../audio/player";
import { applyEntry, applyProgress, cloudId, ensureSyncKeys, entryKind, pendingDeletions } from "../library/cloud";
import { deleteBook } from "../library/repository";
import { getDB } from "../storage/db";
import type { Bookmark, BookRecord, CloudEntry, CloudProgress, CloudRecord, LibrarrSource, ProgressRecord } from "../storage/types";
import { deviceId } from "./identity";

const LIBRARY = "library";
const PROGRESS = "progress";
const CONFLICT = "user_id,book_key";
const PULLED_KEY = "boowie-cloud-pulled";
/** Rows written around the last download may become visible a little later: look back this far. */
const OVERLAP_MS = 5 * 60_000;

/** The tables aren't there yet (supabase/schema.sql wasn't run again): the library stays on the device. */
export class LibraryNotSetUp extends Error {}

interface LibraryRow {
  user_id: string;
  book_key: string;
  kind: CloudEntry["kind"];
  format: CloudEntry["format"];
  title: string;
  author: string;
  narrator: string | null;
  store_id: string | null;
  cover_url: string | null;
  duration: number | null;
  file_size: number | null;
  source: LibrarrSource | null;
  edited_chapters: Record<string, string> | null;
  deleted: boolean;
  updated_at: string;
  synced_at?: string;
}

interface ProgressRow {
  user_id: string;
  book_key: string;
  chapter_index: number;
  position: number;
  audio_timestamp: number;
  percentage: number;
  completed_chapters: number[] | null;
  bookmarks: Bookmark[] | null;
  removed_bookmarks: string[] | null;
  device_id: string;
  updated_at: string;
  synced_at?: string;
}

const time = (iso: string | undefined) => (iso ? Date.parse(iso) || 0 : 0);

const entryFromRow = (r: LibraryRow): CloudEntry => ({
  key: r.book_key,
  kind: r.kind,
  format: r.format,
  title: r.title ?? "",
  author: r.author ?? "",
  narrator: r.narrator ?? undefined,
  storeId: r.store_id ?? undefined,
  coverUrl: r.cover_url ?? undefined,
  duration: r.duration ?? undefined,
  fileSize: r.file_size ?? undefined,
  source: r.source ?? undefined,
  editedChapters: r.edited_chapters ? Object.fromEntries(Object.entries(r.edited_chapters).map(([k, v]) => [Number(k), v])) : undefined,
  deleted: !!r.deleted,
  updatedAt: time(r.updated_at),
});

const rowFromBook = (user: string, b: BookRecord): LibraryRow => ({
  user_id: user,
  book_key: b.syncKey!,
  kind: entryKind(b.syncKey!),
  format: b.format,
  title: b.title,
  author: b.author,
  narrator: b.narrator ?? null,
  store_id: b.storeId ?? null,
  cover_url: b.storeId ? b.coverUrl ?? null : null,
  duration: b.duration ?? null,
  file_size: b.fileSize ?? null,
  source: b.source ?? null,
  edited_chapters: b.editedChapters ?? null,
  deleted: false,
  updated_at: new Date(b.infoUpdatedAt ?? b.addedAt).toISOString(),
});

const progressFromRow = (r: ProgressRow): CloudProgress => ({
  currentChapterIndex: r.chapter_index ?? 0,
  scrollOffsetOrPage: r.position ?? 0,
  audioTimestamp: r.audio_timestamp ?? 0,
  percentage: r.percentage ?? 0,
  completedChapters: r.completed_chapters ?? [],
  bookmarks: r.bookmarks ?? [],
  removedBookmarks: r.removed_bookmarks ?? [],
  updatedAt: time(r.updated_at),
});

const rowFromProgress = (user: string, key: string, p: ProgressRecord): ProgressRow => ({
  user_id: user,
  book_key: key,
  chapter_index: p.currentChapterIndex,
  position: p.scrollOffsetOrPage,
  audio_timestamp: p.audioTimestamp,
  percentage: p.percentage,
  completed_chapters: p.completedChapters ?? [],
  bookmarks: p.bookmarks ?? [],
  removed_bookmarks: p.removedBookmarks ?? [],
  device_id: deviceId(),
  updated_at: new Date(p.updatedAt).toISOString(),
});

function check(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (["PGRST205", "42P01", "42703"].includes(error.code ?? "") || /does not exist|could not find the table/i.test(error.message)) {
    throw new LibraryNotSetUp(error.message);
  }
  throw new Error(error.message);
}

function readPulled(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(PULLED_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function savePulled(user: string, at: number): void {
  try {
    localStorage.setItem(PULLED_KEY, JSON.stringify({ ...readPulled(), [user]: at }));
  } catch {
    /* the next download looks further back */
  }
}

/** Rows of the account the server got after `since` (server time), or all of them. */
async function changedRows<R extends { synced_at?: string }>(c: SupabaseClient, table: string, user: string, since: number): Promise<R[]> {
  const rows: R[] = [];
  for (let from = 0; ; from += 1000) {
    let q = c.from(table).select("*").eq("user_id", user);
    if (since) q = q.gt("synced_at", new Date(since - OVERLAP_MS).toISOString());
    const { data, error } = await q.range(from, from + 999);
    check(error);
    rows.push(...((data ?? []) as R[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/** Download what changed in the account and take it into this device's library. */
async function pull(c: SupabaseClient, user: string): Promise<void> {
  const db = getDB();
  const since = readPulled()[user] ?? 0;
  const [entries, places] = await Promise.all([changedRows<LibraryRow>(c, LIBRARY, user, since), changedRows<ProgressRow>(c, PROGRESS, user, since)]);
  const newest = Math.max(since, ...entries.map((r) => time(r.synced_at)), ...places.map((r) => time(r.synced_at)));
  if (!entries.length && !places.length) {
    if (newest > since) savePulled(user, newest);
    return;
  }

  // The account's copy on the device.
  const changed = new Map<string, CloudRecord>();
  const keys = [...new Set([...entries.map((r) => r.book_key), ...places.map((r) => r.book_key)])];
  const stored = await db.cloud.bulkGet(keys.map((k) => cloudId(user, k)));
  keys.forEach((key, i) => changed.set(key, stored[i] ?? { id: cloudId(user, key), owner: user, key }));
  for (const r of entries) changed.get(r.book_key)!.entry = entryFromRow(r);
  for (const r of places) changed.get(r.book_key)!.progress = progressFromRow(r);
  await db.cloud.bulkPut([...changed.values()]);

  // The books on this device.
  const books = await db.books.where("syncKey").anyOf(keys).toArray();
  for (const book of books) {
    const rec = changed.get(book.syncKey!);
    if (!rec) continue;
    if (rec.entry?.deleted) {
      if (book.addedAt > rec.entry.updatedAt) {
        // Added here again after it was deleted elsewhere: it goes back into the account.
        await db.books.update(book.id, { syncedAt: undefined });
      } else {
        unloadIfCurrent(book.id);
        await deleteBook(book.id);
      }
      continue;
    }
    if (rec.entry) await applyEntry(book, rec.entry);
    if (rec.progress) await applyProgress(book.id, rec.progress);
  }
  savePulled(user, newest);
}

/** Upload the books and places that changed on this device since the last upload. */
async function push(c: SupabaseClient, user: string): Promise<void> {
  const db = getDB();

  const deletions = pendingDeletions(user);
  if (deletions.items.length) {
    const rows = deletions.items.map((d) => ({
      user_id: user, book_key: d.key, kind: d.kind, format: d.format, title: d.title, author: d.author, deleted: true, updated_at: new Date(d.at).toISOString(),
    }));
    const { error } = await c.from(LIBRARY).upsert(rows, { onConflict: CONFLICT });
    check(error);
    deletions.done();
  }
  const deleted = new Set(deletions.items.map((d) => d.key));

  const books = (await db.books.toArray()).filter((b) => b.syncKey && !deleted.has(b.syncKey));
  const dirtyBooks = new Map<string, BookRecord>();
  for (const b of books) {
    if (b.syncedAt !== undefined && (b.infoUpdatedAt ?? 0) <= b.syncedAt) continue;
    const prev = dirtyBooks.get(b.syncKey!);
    if (!prev || (b.infoUpdatedAt ?? b.addedAt) > (prev.infoUpdatedAt ?? prev.addedAt)) dirtyBooks.set(b.syncKey!, b);
  }
  if (dirtyBooks.size) {
    const list = [...dirtyBooks.values()];
    const { error } = await c.from(LIBRARY).upsert(list.map((b) => rowFromBook(user, b)), { onConflict: CONFLICT });
    check(error);
    await db.transaction("rw", db.books, db.cloud, async () => {
      for (const b of list) {
        await db.books.where("syncKey").equals(b.syncKey!).modify((x) => {
          if (x.infoUpdatedAt === b.infoUpdatedAt) x.syncedAt = b.infoUpdatedAt ?? 0;
        });
        const id = cloudId(user, b.syncKey!);
        const rec = (await db.cloud.get(id)) ?? { id, owner: user, key: b.syncKey! };
        await db.cloud.put({ ...rec, entry: entryFromRow({ ...rowFromBook(user, b) }) });
      }
    });
  }

  const byId = new Map(books.map((b) => [b.id, b]));
  const progress = await db.progress.bulkGet([...byId.keys()]);
  const dirtyPlaces = new Map<string, ProgressRecord>();
  for (const p of progress) {
    if (!p || !p.updatedAt || p.updatedAt <= (p.syncedAt ?? 0)) continue;
    const key = byId.get(p.bookId)!.syncKey!;
    const prev = dirtyPlaces.get(key);
    if (!prev || p.updatedAt > prev.updatedAt) dirtyPlaces.set(key, p);
  }
  if (dirtyPlaces.size) {
    const list = [...dirtyPlaces.entries()];
    const { error } = await c.from(PROGRESS).upsert(list.map(([key, p]) => rowFromProgress(user, key, p)), { onConflict: CONFLICT });
    check(error);
    await db.transaction("rw", db.progress, db.cloud, async () => {
      for (const [key, p] of list) {
        await db.progress.where("bookId").equals(p.bookId).modify((x) => {
          if (x.updatedAt === p.updatedAt) x.syncedAt = p.updatedAt;
        });
        const id = cloudId(user, key);
        const rec = (await db.cloud.get(id)) ?? { id, owner: user, key };
        await db.cloud.put({ ...rec, progress: progressFromRow(rowFromProgress(user, key, p)) });
      }
    });
  }
}

/** One exchange with the server: download first (when asked), then upload what this device has new. */
export async function syncLibrary(c: SupabaseClient, user: string, opts: { pull: boolean }): Promise<void> {
  await ensureSyncKeys();
  if (opts.pull) await pull(c, user);
  await push(c, user);
}

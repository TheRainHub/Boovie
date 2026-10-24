import { deleteFiles, newId, putFile, revokeFileUrls } from "../storage/blobStore";
import { getDB } from "../storage/db";
import type { BookRecord, Bookmark, ChapterRecord, ProgressRecord } from "../storage/types";
import type { ParsedBook } from "../parsers/types";

export interface SaveOptions {
  isStoreBook?: boolean;
  storeId?: string;
  coverUrl?: string;
  /** Overrides from the store catalog (cleaner metadata than file tags). */
  title?: string;
  author?: string;
  annotation?: string;
  narrator?: string;
  language?: string;
  coverSource?: BookRecord["coverSource"];
}

/** Persist a parsed book: blobs first (OPFS/IndexedDB), then records in one transaction. */
export async function saveParsedBook(parsed: ParsedBook, opts: SaveOptions = {}): Promise<string> {
  const db = getDB();
  const bookId = newId("b");
  const fileIds: string[] = [];
  try {
    const sourceIds: string[] = [];
    for (const src of parsed.sources) {
      const rec = await putFile(src.blob, { bookId, name: src.name, role: "source", mime: src.mime });
      sourceIds.push(rec.id);
      fileIds.push(rec.id);
    }
    const assetIds = new Map<string, string>();
    for (const a of parsed.assets) {
      const rec = await putFile(a.blob, { bookId, name: a.name, role: "asset" });
      assetIds.set(a.key, rec.id);
      fileIds.push(rec.id);
    }
    let coverFileId: string | undefined;
    if (parsed.cover && parsed.cover.size > 0) {
      const rec = await putFile(parsed.cover, { bookId, name: "cover", role: "cover" });
      coverFileId = rec.id;
      fileIds.push(rec.id);
    }

    const chapters: ChapterRecord[] = parsed.chapters.map((c, index) => {
      let content = "";
      if (parsed.format === "audio") content = sourceIds[c.sourceIndex ?? 0];
      else if (c.html) {
        content = c.html.replace(/data-asset="([^"]+)"/g, (m, key: string) => {
          const id = assetIds.get(key);
          return id ? `data-asset="${id}"` : m;
        });
      }
      return {
        id: `${bookId}:${index}`,
        bookId,
        index,
        title: c.title,
        group: c.group,
        contentOrBlobRef: content,
        startTime: c.startTime,
        duration: c.duration,
        fileStart: c.fileStart,
        startPage: c.startPage,
        endPage: c.endPage,
        charCount: c.charCount,
      };
    });

    const book: BookRecord = {
      id: bookId,
      title: opts.title ?? parsed.title,
      author: opts.author ?? parsed.author,
      coverUrl: opts.coverUrl,
      coverFileId,
      coverSource: coverFileId ? opts.coverSource ?? (opts.isStoreBook ? "store" : "embedded") : undefined,
      format: parsed.format,
      totalChapters: chapters.length,
      addedAt: Date.now(),
      fileSize: parsed.sources.reduce((s, f) => s + f.blob.size, 0),
      isStoreBook: !!opts.isStoreBook,
      storeId: opts.storeId,
      annotation: opts.annotation ?? parsed.annotation,
      language: opts.language ?? parsed.language,
      narrator: opts.narrator ?? parsed.narrator,
      duration: parsed.duration,
      pageCount: parsed.pageCount,
      totalChars: chapters.reduce((s, c) => s + (c.charCount ?? 0), 0) || undefined,
      sourceFileIds: sourceIds,
    };

    await db.transaction("rw", db.books, db.chapters, db.progress, async () => {
      await db.books.add(book);
      await db.chapters.bulkAdd(chapters);
      await db.progress.put(emptyProgress(bookId));
    });
    return bookId;
  } catch (e) {
    await deleteFiles(fileIds).catch(() => undefined);
    throw e;
  }
}

export function emptyProgress(bookId: string): ProgressRecord {
  return { bookId, currentChapterIndex: 0, scrollOffsetOrPage: 0, audioTimestamp: 0, percentage: 0, updatedAt: 0, bookmarks: [], completedChapters: [] };
}

export async function deleteBook(bookId: string): Promise<void> {
  const db = getDB();
  const files = await db.files.where("bookId").equals(bookId).primaryKeys();
  revokeFileUrls(files);
  await deleteFiles(files);
  await db.transaction("rw", db.books, db.chapters, db.progress, async () => {
    const book = await db.books.get(bookId);
    if (book?.companionId) await db.books.update(book.companionId, { companionId: undefined });
    await db.chapters.where("bookId").equals(bookId).delete();
    await db.progress.delete(bookId);
    await db.books.delete(bookId);
  });
}

/** Replace a book's cover with a stored image (or a remote URL that couldn't be downloaded because of CORS). */
export async function setBookCover(
  bookId: string,
  cover: { blob: Blob } | { url: string },
  source: NonNullable<BookRecord["coverSource"]>,
): Promise<void> {
  const db = getDB();
  const book = await db.books.get(bookId);
  if (!book) return;
  const old = book.coverFileId;
  if ("blob" in cover) {
    const rec = await putFile(cover.blob, { bookId, name: "cover", role: "cover" });
    await db.books.update(bookId, { coverFileId: rec.id, coverSource: source });
  } else {
    await db.books.update(bookId, { coverFileId: undefined, coverUrl: cover.url, coverSource: source });
  }
  if (old) {
    revokeFileUrls([old]);
    await deleteFiles([old]);
  }
}

export async function linkCompanions(aId: string, bId: string): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.books, async () => {
    await db.books.update(aId, { companionId: bId });
    await db.books.update(bId, { companionId: aId });
  });
}

export async function getProgress(bookId: string): Promise<ProgressRecord> {
  return (await getDB().progress.get(bookId)) ?? emptyProgress(bookId);
}

/** Merge a partial progress update. Writes are cheap (single small record) and safe to call on every page turn. */
export async function updateProgress(bookId: string, patch: Partial<Omit<ProgressRecord, "bookId">>): Promise<void> {
  const db = getDB();
  await db.transaction("rw", db.progress, db.books, async () => {
    const cur = (await db.progress.get(bookId)) ?? emptyProgress(bookId);
    const completed = patch.completedChapters ?? cur.completedChapters ?? [];
    await db.progress.put({ ...cur, ...patch, completedChapters: completed, bookId, updatedAt: Date.now() });
    await db.books.update(bookId, { lastOpenedAt: Date.now() });
  });
}

export async function markChaptersComplete(bookId: string, indices: number[]): Promise<void> {
  const cur = await getProgress(bookId);
  const set = new Set(cur.completedChapters ?? []);
  let changed = false;
  for (const i of indices) if (!set.has(i)) { set.add(i); changed = true; }
  if (changed) await updateProgress(bookId, { completedChapters: [...set].sort((a, b) => a - b) });
}

export async function addBookmark(bookId: string, bm: Omit<Bookmark, "id" | "createdAt">): Promise<Bookmark> {
  const cur = await getProgress(bookId);
  const bookmark: Bookmark = { ...bm, id: newId("bm"), createdAt: Date.now() };
  await updateProgress(bookId, { bookmarks: [...cur.bookmarks, bookmark] });
  return bookmark;
}

export async function updateBookmark(bookId: string, id: string, patch: Partial<Bookmark>): Promise<void> {
  const cur = await getProgress(bookId);
  await updateProgress(bookId, { bookmarks: cur.bookmarks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
}

export async function removeBookmark(bookId: string, id: string): Promise<void> {
  const cur = await getProgress(bookId);
  await updateProgress(bookId, { bookmarks: cur.bookmarks.filter((b) => b.id !== id) });
}

export async function getChapter(bookId: string, index: number): Promise<ChapterRecord | undefined> {
  return getDB().chapters.get(`${bookId}:${index}`);
}

export async function getChapters(bookId: string): Promise<ChapterRecord[]> {
  return getDB().chapters.where("[bookId+index]").between([bookId, 0], [bookId, Infinity]).toArray();
}

/** Whole-book percentage for text formats, weighted by chapter length. */
export function textPercentage(chapters: Pick<ChapterRecord, "charCount">[], chapterIndex: number, fraction: number): number {
  const total = chapters.reduce((s, c) => s + (c.charCount ?? 0), 0);
  if (!total) return chapters.length ? ((chapterIndex + fraction) / chapters.length) * 100 : 0;
  const before = chapters.slice(0, chapterIndex).reduce((s, c) => s + (c.charCount ?? 0), 0);
  return ((before + fraction * (chapters[chapterIndex]?.charCount ?? 0)) / total) * 100;
}

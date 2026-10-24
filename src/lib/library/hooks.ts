"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDB } from "../storage/db";
import { getFileUrl } from "../storage/blobStore";
import type { BookRecord, ChapterRecord, ProgressRecord } from "../storage/types";

export function useBooks(): BookRecord[] | undefined {
  return useLiveQuery(() => getDB().books.orderBy("addedAt").reverse().toArray(), []);
}

/**
 * A live query for one key. useLiveQuery keeps returning the previous key's result until the new query has
 * answered, so a screen would briefly see «no book / no progress» for the next id and act on it (a reader
 * opened at chapter 1 and saved that over the real position). This returns undefined until the answer is
 * for this very key. `attempt` re-runs the query.
 */
function useKeyedQuery<T>(key: string | null | undefined, query: (key: string) => Promise<T>, empty: T, attempt = 0): T | undefined {
  const res = useLiveQuery(async () => ({ key, attempt, value: key ? await query(key) : empty }), [key, attempt]);
  return res && res.key === key && res.attempt === attempt ? res.value : undefined;
}

export function useBook(id: string | null | undefined, attempt = 0): BookRecord | null | undefined {
  return useKeyedQuery(id, async (k) => (await getDB().books.get(k)) ?? null, null, attempt);
}

export function useAllProgress(): Map<string, ProgressRecord> | undefined {
  return useLiveQuery(async () => new Map((await getDB().progress.toArray()).map((p) => [p.bookId, p])), []);
}

export function useProgress(bookId: string | null | undefined): ProgressRecord | null | undefined {
  return useKeyedQuery(bookId, async (k) => (await getDB().progress.get(k)) ?? null, null);
}

/** Chapter metadata without the (potentially large) HTML payload. */
export type ChapterMeta = Omit<ChapterRecord, "contentOrBlobRef"> & { contentOrBlobRef?: string };

export function useChapterList(bookId: string | null | undefined): ChapterMeta[] | undefined {
  return useKeyedQuery(bookId, async (k) => {
    const rows = await getDB().chapters.where("[bookId+index]").between([k, 0], [k, Infinity]).toArray();
    return rows.map(({ contentOrBlobRef, ...rest }) => ({ ...rest, contentOrBlobRef: rest.duration !== undefined ? contentOrBlobRef : undefined }));
  }, [] as ChapterMeta[]);
}

export function useStoreIdsInLibrary(): Map<string, string> | undefined {
  return useLiveQuery(async () => {
    const books = await getDB().books.where("storeId").above("").toArray();
    return new Map(books.map((b) => [b.storeId!, b.id]));
  }, []);
}

/** Object URL for a stored blob (cover, asset); falls back to a static URL. */
export function useFileUrl(fileId: string | undefined, fallback?: string): string | undefined {
  const [state, setState] = useState<{ id?: string; url?: string }>({});
  useEffect(() => {
    let alive = true;
    if (fileId) {
      void getFileUrl(fileId).then((u) => alive && setState({ id: fileId, url: u ?? undefined }));
    }
    return () => {
      alive = false;
    };
  }, [fileId]);
  return (fileId && state.id === fileId ? state.url : undefined) ?? fallback;
}

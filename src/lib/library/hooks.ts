"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { getDB } from "../storage/db";
import { getFileUrl } from "../storage/blobStore";
import type { BookRecord, ChapterRecord, ProgressRecord } from "../storage/types";

export function useBooks(): BookRecord[] | undefined {
  return useLiveQuery(() => getDB().books.orderBy("addedAt").reverse().toArray(), []);
}

export function useBook(id: string | null | undefined): BookRecord | null | undefined {
  return useLiveQuery(async () => (id ? (await getDB().books.get(id)) ?? null : null), [id]);
}

export function useAllProgress(): Map<string, ProgressRecord> | undefined {
  return useLiveQuery(async () => new Map((await getDB().progress.toArray()).map((p) => [p.bookId, p])), []);
}

export function useProgress(bookId: string | null | undefined): ProgressRecord | null | undefined {
  return useLiveQuery(async () => (bookId ? (await getDB().progress.get(bookId)) ?? null : null), [bookId]);
}

/** Chapter metadata without the (potentially large) HTML payload. */
export type ChapterMeta = Omit<ChapterRecord, "contentOrBlobRef"> & { contentOrBlobRef?: string };

export function useChapterList(bookId: string | null | undefined): ChapterMeta[] | undefined {
  return useLiveQuery(async () => {
    if (!bookId) return [];
    const rows = await getDB().chapters.where("[bookId+index]").between([bookId, 0], [bookId, Infinity]).toArray();
    return rows.map(({ contentOrBlobRef, ...rest }) => ({ ...rest, contentOrBlobRef: rest.duration !== undefined ? contentOrBlobRef : undefined }));
  }, [bookId]);
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

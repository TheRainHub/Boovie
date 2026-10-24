"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { usePlayer } from "../audio/player";
import { getDB } from "../storage/db";
import type { BookRecord, ProgressRecord } from "../storage/types";

export interface CurrentBook {
  book: BookRecord;
  progress?: ProgressRecord;
}

/**
 * The book the home screen is about: whatever is playing, otherwise the most recently opened unfinished book,
 * otherwise the newest one on the shelf. `undefined` while loading, `null` when the library is empty.
 */
export function useCurrentBook(): CurrentBook | null | undefined {
  const playing = usePlayer((s) => (s.isPlaying ? s.bookId : null));
  return useLiveQuery(async () => {
    const db = getDB();
    if (playing) {
      const book = await db.books.get(playing);
      if (book) return { book, progress: await db.progress.get(playing) };
    }
    const recent = await db.books.orderBy("lastOpenedAt").reverse().limit(12).toArray();
    for (const book of recent) {
      const progress = await db.progress.get(book.id);
      if ((progress?.percentage ?? 0) < 99.5) return { book, progress };
    }
    const newest = await db.books.orderBy("addedAt").reverse().first();
    return newest ? { book: newest, progress: await db.progress.get(newest.id) } : null;
  }, [playing]);
}

/** First navigation word: what you are doing right now. */
export function activityLabel(current: CurrentBook | null | undefined): string {
  if (!current) return "Главная";
  return current.book.format === "audio" ? "Слушаю" : "Читаю";
}

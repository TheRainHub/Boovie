"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useSyncExternalStore } from "react";
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

const LABEL_KEY = "boowie-activity-label";
let lastLabel: string | null = null;

function storedLabel(): string {
  if (lastLabel === null) {
    try {
      lastLabel = localStorage.getItem(LABEL_KEY);
    } catch {
      /* no storage */
    }
    lastLabel ??= "Главная";
  }
  return lastLabel;
}

/**
 * `activityLabel` for the navigation. Every page mounts its own navigation, and the current book takes a moment
 * to load: until then the word it showed last is kept (also across launches), so it doesn't flash «Главная».
 */
export function useActivityLabel(): string {
  const current = useCurrentBook();
  // The static export is prerendered without storage: the first client render must say what the HTML says.
  const remembered = useSyncExternalStore(noSubscribe, storedLabel, () => "Главная");
  const label = current === undefined ? remembered : activityLabel(current);
  useEffect(() => {
    if (current === undefined || label === lastLabel) return;
    lastLabel = label;
    try {
      localStorage.setItem(LABEL_KEY, label);
    } catch {
      /* no storage */
    }
  }, [current, label]);
  return label;
}

const noSubscribe = () => () => {};

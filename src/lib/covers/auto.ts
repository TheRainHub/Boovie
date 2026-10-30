"use client";

/** After import: make sure a book has a cover — generated offline right away, replaced by an online match when found. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setBookCover } from "../library/repository";
import { getDB } from "../storage/db";
import type { BookRecord } from "../storage/types";
import { generateCover } from "./generate";
import { downloadCover, searchCovers } from "./lookup";
import { t } from "../i18n";

interface CoverPrefs {
  online: boolean;
  set: (online: boolean) => void;
}

export const useCoverPrefs = create<CoverPrefs>()(
  persist((set) => ({ online: true, set: (online) => set({ online }) }), { name: "titan-cover-prefs", version: 1 }),
);

/** Minimum match score to apply an online cover without asking. */
export const AUTO_APPLY_SCORE = 0.75;

async function drawCover(book: BookRecord): Promise<void> {
  const square = book.format === "audio";
  try {
    const blob = await generateCover({ title: book.title, author: book.author, square, label: square ? t("Аудиокнига") : book.format.toUpperCase() });
    await setBookCover(book.id, { blob }, "generated");
  } catch {
    /* canvas unavailable — the UI falls back to a typographic plate */
  }
}

/**
 * A generated cover shows the book's name: after a rename, draw it again and look for a real one under the new
 * name. `onChange` runs after each new cover.
 */
export async function refreshGeneratedCover(bookId: string, onChange?: () => void): Promise<void> {
  const book = await getDB().books.get(bookId);
  if (!book || book.coverSource !== "generated") return;
  await drawCover(book);
  onChange?.();
  await ensureCover(bookId);
  if ((await getDB().books.get(bookId))?.coverSource === "online") onChange?.();
}

export async function ensureCover(bookId: string): Promise<void> {
  const db = getDB();
  let book = await db.books.get(bookId);
  if (!book) return;
  const square = book.format === "audio";
  if (!book.coverFileId && !book.coverUrl) {
    await drawCover(book);
    book = await db.books.get(bookId);
  }
  if (!book || book.coverSource !== "generated") return;
  if (!useCoverPrefs.getState().online || (typeof navigator !== "undefined" && !navigator.onLine)) return;

  const results = await searchCovers({ title: book.title, author: book.author, kind: square ? "audio" : "text" });
  for (const c of results.filter((r) => r.score >= AUTO_APPLY_SCORE).slice(0, 4)) {
    const blob = await downloadCover(c.full) ?? (await downloadCover(c.thumb));
    if (blob) {
      const current = await db.books.get(bookId);
      // The user may have picked a cover meanwhile.
      if (current?.coverSource === "generated") await setBookCover(bookId, { blob }, "online");
      return;
    }
  }
}

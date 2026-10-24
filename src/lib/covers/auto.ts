"use client";

/** After import: make sure a book has a cover — generated offline right away, replaced by an online match when found. */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setBookCover } from "../library/repository";
import { getDB } from "../storage/db";
import { generateCover } from "./generate";
import { downloadCover, searchCovers } from "./lookup";

interface CoverPrefs {
  online: boolean;
  set: (online: boolean) => void;
}

export const useCoverPrefs = create<CoverPrefs>()(
  persist((set) => ({ online: true, set: (online) => set({ online }) }), { name: "titan-cover-prefs", version: 1 }),
);

/** Minimum match score to apply an online cover without asking. */
export const AUTO_APPLY_SCORE = 0.75;

export async function ensureCover(bookId: string): Promise<void> {
  const db = getDB();
  let book = await db.books.get(bookId);
  if (!book) return;
  const square = book.format === "audio";
  if (!book.coverFileId && !book.coverUrl) {
    try {
      const blob = await generateCover({ title: book.title, author: book.author, square, label: square ? "Аудиокнига" : book.format.toUpperCase() });
      await setBookCover(bookId, { blob }, "generated");
    } catch {
      /* canvas unavailable — the UI falls back to a typographic plate */
    }
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

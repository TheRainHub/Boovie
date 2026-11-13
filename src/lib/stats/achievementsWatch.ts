"use client";

/**
 * Telling about a new achievement as it happens. The levels this device has already seen are kept per account in
 * localStorage; the first look at an account only takes note of them. Only levels reached today or yesterday are
 * announced, so books and days arriving from another device don't bring a burst of old news.
 */
import { currentOwner } from "../account/identity";
import { getDB } from "../storage/db";
import { dayKey } from "./activity";
import { achievements, type AchievementInput, type AchievementState } from "./achievements";

const SEEN_KEY = "boowie-achievements";

export async function achievementInput(owner: string): Promise<AchievementInput> {
  const db = getDB();
  const [rows, books, progress] = await Promise.all([
    db.activity.where("owner").equals(owner).toArray(),
    db.books.toArray(),
    db.progress.toArray(),
  ]);
  return { rows, added: books.map((b) => b.addedAt), bookmarks: progress.flatMap((p) => p.bookmarks.map((b) => b.createdAt)) };
}

function readSeen(): Record<string, Record<string, number>> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as Record<string, Record<string, number>>;
  } catch {
    return {};
  }
}

let running: Promise<void> | null = null;

/** Work the achievements out and pass newly reached levels to `announce` (at most three at a time). */
export function checkAchievements(announce: (s: AchievementState) => void): Promise<void> {
  running ??= (async () => {
    const owner = currentOwner();
    const list = achievements(await achievementInput(owner));
    const seen = readSeen();
    const known = seen[owner];
    const recent = new Set([dayKey(), dayKey(new Date(Date.now() - 86_400_000))]);
    if (known) {
      list
        .filter((s) => s.level > (known[s.def.id] ?? 0) && recent.has(s.earned[s.level - 1]))
        .slice(0, 3)
        .forEach(announce);
    }
    seen[owner] = Object.fromEntries(list.map((s) => [s.def.id, Math.max(s.level, known?.[s.def.id] ?? 0)]));
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
    } catch {
      /* private mode */
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      running = null;
    });
  return running;
}

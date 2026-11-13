/**
 * «Карта чтения»: every day of a year with the time spent with books, from the profile's activity rows (this
 * device's and, with an account, the other devices').
 */
import type { ActivityRecord } from "../storage/types";

export interface MapDay {
  listen: number;
  read: number;
  /** The day's books by time, most first. */
  books: { title: string; seconds: number }[];
}

export interface YearMap {
  year: number;
  days: Map<string, MapDay>;
  seconds: number;
  /** Days with at least a minute with a book. */
  activeDays: number;
  best: { day: string; seconds: number } | null;
}

const MIN_ACTIVE = 60;

/** Shade 0..5 of a day: none, under 15 minutes, 30, an hour, two hours, more. */
export function level(seconds: number): number {
  if (seconds < MIN_ACTIVE) return 0;
  const min = seconds / 60;
  return min < 15 ? 1 : min < 30 ? 2 : min < 60 ? 3 : min < 120 ? 4 : 5;
}

/** Years that have rows, and the current one; oldest first. */
export function mapYears(rows: ActivityRecord[], now = new Date()): number[] {
  const years = new Set<number>([now.getFullYear()]);
  for (const r of rows) years.add(Number(r.day.slice(0, 4)));
  return [...years].filter((y) => y >= 2000 && y <= now.getFullYear()).sort((a, b) => a - b);
}

export function yearMap(rows: ActivityRecord[], year: number): YearMap {
  const prefix = `${year}-`;
  const days = new Map<string, MapDay>();
  const titles = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!r.day.startsWith(prefix) || r.seconds <= 0) continue;
    const d = days.get(r.day) ?? { listen: 0, read: 0, books: [] };
    d[r.kind] += r.seconds;
    days.set(r.day, d);
    const per = titles.get(r.day) ?? new Map<string, number>();
    per.set(r.title, (per.get(r.title) ?? 0) + r.seconds);
    titles.set(r.day, per);
  }
  let seconds = 0;
  let activeDays = 0;
  let best: YearMap["best"] = null;
  for (const [day, d] of days) {
    d.books = [...(titles.get(day) ?? [])].map(([title, s]) => ({ title, seconds: s })).sort((a, b) => b.seconds - a.seconds);
    const total = d.listen + d.read;
    seconds += total;
    if (total >= MIN_ACTIVE) activeDays++;
    if (total >= MIN_ACTIVE && (!best || total > best.seconds)) best = { day, seconds: total };
  }
  return { year, days, seconds, activeDays, best };
}

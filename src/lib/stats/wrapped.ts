/**
 * «Итоги года»: the year's reading and listening, from the same daily rows as the profile (this device's and, with
 * an account, the other devices'). Everything is counted on the device.
 */
import type { ActivityRecord } from "../storage/types";

export interface WrappedBook {
  key: string;
  title: string;
  author: string;
  seconds: number;
  listen: number;
  read: number;
  finished: boolean;
}

export type Persona = "marathoner" | "steady" | "listener" | "reader" | "explorer" | "allrounder";

export interface Wrapped {
  year: number;
  seconds: number;
  listenSeconds: number;
  readSeconds: number;
  /** Book time played (more than listening time at higher speeds). */
  audioSeconds: number;
  pages: number;
  activeDays: number;
  /** All books of the year by time, most first. */
  books: WrappedBook[];
  finished: WrappedBook[];
  author: { name: string; seconds: number; books: number } | null;
  /** Seconds by month (0 = January). */
  months: number[];
  bestMonth: number;
  /** Seconds by weekday (0 = Monday). */
  weekdays: number[];
  bestWeekday: number;
  bestDay: { day: string; seconds: number } | null;
  streak: { days: number; from: string; to: string };
  persona: Persona;
}

/** A day counts when it had at least a minute with a book. */
const MIN_ACTIVE = 60;

/** The year to show: the current one, or last year's in January (when it has just ended). */
export function wrappedYear(now = new Date()): number {
  return now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
}

/** «Итоги года» are offered in their season: December and January. */
export function wrappedSeason(now = new Date()): boolean {
  return now.getMonth() === 11 || now.getMonth() === 0;
}

/** Enough for a story: half an hour with books, or a finished book. */
export function hasWrapped(rows: ActivityRecord[], year: number): boolean {
  const prefix = `${year}-`;
  let seconds = 0;
  for (const r of rows) {
    if (!r.day.startsWith(prefix)) continue;
    if (r.finished) return true;
    seconds += r.seconds;
    if (seconds >= 30 * 60) return true;
  }
  return false;
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** The author part of a name for counting («Лев Толстой» and «Л. Толстой» stay apart; that's fine). */
function authorOf(name: string): string | null {
  const a = name.split(/[,;&]| и | and /)[0]?.trim();
  return a && !/неизвестн|unknown/i.test(a) ? a : null;
}

export function wrapYear(rows: ActivityRecord[], year: number): Wrapped {
  const prefix = `${year}-`;
  const inYear = rows.filter((r) => r.day.startsWith(prefix));

  const books = new Map<string, WrappedBook>();
  const named = new Map<string, number>();
  const perDay = new Map<string, number>();
  const months = new Array(12).fill(0);
  const weekdays = new Array(7).fill(0);
  let listenSeconds = 0;
  let readSeconds = 0;
  let audioSeconds = 0;
  let pages = 0;

  for (const r of inYear) {
    if (r.kind === "listen") {
      listenSeconds += r.seconds;
      audioSeconds += r.audioSeconds;
    } else {
      readSeconds += r.seconds;
      pages += r.pages;
    }
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.seconds);
    months[Number(r.day.slice(5, 7)) - 1] += r.seconds;
    weekdays[(new Date(`${r.day}T12:00:00`).getDay() + 6) % 7] += r.seconds;
    const b = books.get(r.bookKey) ?? { key: r.bookKey, title: r.title, author: r.author, seconds: 0, listen: 0, read: 0, finished: false };
    b[r.kind] += r.seconds;
    b.seconds += r.seconds;
    b.finished ||= r.finished;
    // The newest row has the book's current name.
    if (r.updatedAt > (named.get(r.bookKey) ?? 0)) {
      named.set(r.bookKey, r.updatedAt);
      b.title = r.title;
      b.author = r.author;
    }
    books.set(r.bookKey, b);
  }

  const sorted = [...books.values()].filter((b) => b.seconds >= MIN_ACTIVE || b.finished).sort((a, b) => b.seconds - a.seconds);
  const finished = sorted.filter((b) => b.finished);

  const authors = new Map<string, { name: string; seconds: number; books: number }>();
  for (const b of sorted) {
    const name = authorOf(b.author);
    if (!name) continue;
    const a = authors.get(name) ?? { name, seconds: 0, books: 0 };
    a.seconds += b.seconds;
    a.books += 1;
    authors.set(name, a);
  }
  const author = [...authors.values()].sort((a, b) => b.seconds - a.seconds)[0] ?? null;

  const days = [...perDay.entries()].filter(([, s]) => s >= MIN_ACTIVE).map(([d]) => d).sort();
  let streak = { days: 0, from: "", to: "" };
  let run = { days: 0, from: "", to: "" };
  for (const d of days) {
    run = run.days && nextDay(run.to) === d ? { ...run, days: run.days + 1, to: d } : { days: 1, from: d, to: d };
    if (run.days > streak.days) streak = run;
  }
  const best = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  const seconds = listenSeconds + readSeconds;

  const argmax = (xs: number[]) => xs.reduce((bi, x, i) => (x > xs[bi] ? i : bi), 0);
  // One word for the year, the most striking first.
  let persona: Persona = "allrounder";
  if (best && best[1] >= 4 * 3600) persona = "marathoner";
  else if (streak.days >= 14) persona = "steady";
  else if (seconds && listenSeconds / seconds >= 0.7) persona = "listener";
  else if (seconds && readSeconds / seconds >= 0.7) persona = "reader";
  else if (sorted.length >= 8) persona = "explorer";

  return {
    year,
    seconds,
    listenSeconds,
    readSeconds,
    audioSeconds,
    pages,
    activeDays: days.length,
    books: sorted,
    finished,
    author: author && (author.books >= 2 || author.seconds >= 3600) ? author : null,
    months,
    bestMonth: argmax(months),
    weekdays,
    bestWeekday: argmax(weekdays),
    bestDay: best && best[1] >= MIN_ACTIVE ? { day: best[0], seconds: best[1] } : null,
    streak,
    persona,
  };
}

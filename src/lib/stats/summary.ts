/** Profile numbers from activity rows (this device's and, with an account, the other devices'). */
import type { ActivityRecord } from "../storage/types";
import { dayKey } from "./activity";
import { getLang, locale } from "../i18n";

export type Period = "week" | "month" | "all";

export interface Bucket {
  /** YYYY-MM-DD for days, YYYY-MM for months. */
  key: string;
  /** Short axis label: «Пн», «21», «окт». */
  label: string;
  /** Full label for the tooltip and the table: «понедельник, 21 октября». */
  title: string;
  listen: number;
  read: number;
  today: boolean;
}

export interface BookTotal {
  bookKey: string;
  title: string;
  author: string;
  listen: number;
  read: number;
}

export interface Summary {
  listenSeconds: number;
  readSeconds: number;
  /** Book time played (more than listening time at higher speeds). */
  audioSeconds: number;
  pages: number;
  finishedRead: number;
  finishedListen: number;
  /** Days in a row with at least a minute of reading or listening, up to today (or yesterday). */
  streak: number;
  activeDays: number;
  buckets: Bucket[];
  top: BookTotal[];
}

// Three-letter months for the Russian chart, which Intl abbreviates unevenly («февр.», «сент.»).
const MONTHS_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]; // i18n-ignore
// Short names in the interface language: «Пн» / «Mon», «Jan».
const short = (d: Date, opts: Intl.DateTimeFormatOptions) => {
  const s = d.toLocaleDateString(locale(), opts).replace(/\.$/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const MIN_ACTIVE = 60;

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function summarize(rows: ActivityRecord[], period: Period, now = new Date()): Summary {
  const todayKey = dayKey(now);
  const first = period === "week" ? dayKey(addDays(now, -6)) : period === "month" ? dayKey(addDays(now, -29)) : "";
  const inRange = rows.filter((r) => r.day >= first && r.day <= todayKey);

  // Per-day totals over all time (streak) and in range (active days).
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.seconds);
  let streak = 0;
  let cursor = (perDay.get(todayKey) ?? 0) >= MIN_ACTIVE ? now : addDays(now, -1);
  while ((perDay.get(dayKey(cursor)) ?? 0) >= MIN_ACTIVE) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  const buckets: Bucket[] = [];
  if (period === "all") {
    const months = [...new Set(rows.map((r) => r.day.slice(0, 7)))].sort();
    const start = months[0] ? new Date(`${months[0]}-01T12:00:00`) : now;
    const count = Math.min(12, Math.max(1, (now.getFullYear() - start.getFullYear()) * 12 + now.getMonth() - start.getMonth() + 1));
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 12);
      const key = dayKey(d).slice(0, 7);
      buckets.push({ key, label: getLang() === "ru" ? MONTHS_RU[d.getMonth()] : short(d, { month: "short" }), title: d.toLocaleDateString(locale(), { month: "long", year: "numeric" }), listen: 0, read: 0, today: i === 0 });
    }
  } else {
    const n = period === "week" ? 7 : 30;
    for (let i = n - 1; i >= 0; i--) {
      const d = addDays(now, -i);
      const key = dayKey(d);
      buckets.push({
        key,
        label: period === "week" ? short(d, { weekday: "short" }) : String(d.getDate()),
        title: d.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" }),
        listen: 0,
        read: 0,
        today: i === 0,
      });
    }
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  const books = new Map<string, BookTotal>();
  const named = new Map<string, number>();
  const finished = { read: new Set<string>(), listen: new Set<string>() };
  const active = new Set<string>();
  let listenSeconds = 0;
  let readSeconds = 0;
  let audioSeconds = 0;
  let pages = 0;
  for (const r of inRange) {
    if (r.kind === "listen") {
      listenSeconds += r.seconds;
      audioSeconds += r.audioSeconds;
    } else {
      readSeconds += r.seconds;
      pages += r.pages;
    }
    if (r.finished) finished[r.kind].add(r.bookKey);
    const b = byKey.get(period === "all" ? r.day.slice(0, 7) : r.day);
    if (b) b[r.kind] += r.seconds;
    const t = books.get(r.bookKey) ?? { bookKey: r.bookKey, title: r.title, author: r.author, listen: 0, read: 0 };
    t[r.kind] += r.seconds;
    // The newest row has the book's current name (a store book renamed on one device keeps its key).
    if (r.updatedAt > (named.get(r.bookKey) ?? 0)) {
      named.set(r.bookKey, r.updatedAt);
      t.title = r.title;
      t.author = r.author;
    }
    books.set(r.bookKey, t);
  }
  for (const [day, s] of perDay) if (day >= first && day <= todayKey && s >= MIN_ACTIVE) active.add(day);

  const top = [...books.values()].filter((b) => b.listen + b.read >= MIN_ACTIVE).sort((a, b) => b.listen + b.read - (a.listen + a.read)).slice(0, 5);
  return {
    listenSeconds,
    readSeconds,
    audioSeconds,
    pages,
    finishedRead: finished.read.size,
    finishedListen: finished.listen.size,
    streak,
    activeDays: active.size,
    buckets,
    top,
  };
}

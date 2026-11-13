/**
 * Achievements: badges for what was read and listened to, counted on the device from the profile's activity rows
 * (which an account gathers from all its devices), the library and the bookmarks. Nothing extra is stored or
 * synced: every device works them out from the same data, with the day each level was reached.
 *
 * Most achievements have levels — bronze, silver, gold, then emerald and ruby for the long ones.
 */
import { locale, pl, t } from "../i18n";
import type { ActivityRecord } from "../storage/types";

export type AchievementIcon =
  | "steps" | "finished" | "hours" | "marathon" | "streak" | "pages" | "listener" | "speed" | "weekend"
  | "both" | "classics" | "authors" | "days" | "collection" | "bookmarks" | "newyear" | "comeback";

export interface AchievementDef {
  id: AchievementIcon;
  /** Thresholds of the levels, in the achievement's unit. */
  tiers: number[];
  /** Hidden until earned. */
  secret?: boolean;
  name: () => string;
  /** What a level asks for: «Дочитать или дослушать 5 книг». */
  goal: (n: number) => string;
}

export interface AchievementState {
  def: AchievementDef;
  /** Current value in the achievement's unit. */
  value: number;
  /** Levels reached (0 = none yet). */
  level: number;
  /** The day (YYYY-MM-DD) each reached level was reached. */
  earned: string[];
}

const books = (n: number) => `${n} ${pl(n, "книга|книги|книг")}`;
const hours = (n: number) => `${n} ${pl(n, "час|часа|часов")}`;
const days = (n: number) => `${n} ${pl(n, "день|дня|дней")}`;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "steps", tiers: [1], name: () => t("Первые шаги"), goal: () => t("Провести с книгой первые минуты") },
  { id: "finished", tiers: [1, 5, 10, 25, 50], name: () => t("Книжный червь"), goal: (n) => t("Дочитать или дослушать {books}", { books: books(n) }) },
  { id: "hours", tiers: [1, 10, 50, 100, 250], name: () => t("Время с книгой"), goal: (n) => t("Провести с книгами {hours}", { hours: hours(n) }) },
  { id: "streak", tiers: [3, 7, 30, 100], name: () => t("Без пропусков"), goal: (n) => t("Читать или слушать {days} подряд", { days: days(n) }) },
  { id: "marathon", tiers: [2, 4, 6], name: () => t("Марафон"), goal: (n) => t("Провести с книгами {hours} за один день", { hours: hours(n) }) },
  { id: "pages", tiers: [100, 1000, 5000, 10000], name: () => t("Страница за страницей"), goal: (n) => t("Перелистнуть {n} {pages}", { n: n.toLocaleString(locale()), pages: pl(n, "страницу|страницы|страниц") }) },
  { id: "listener", tiers: [5, 25, 100], name: () => t("Слушатель"), goal: (n) => t("Слушать аудиокниги {hours}", { hours: hours(n) }) },
  { id: "speed", tiers: [1, 5, 20], name: () => t("Скороход"), goal: (n) => t("Сберечь ускорением {hours}", { hours: hours(n) }) },
  { id: "both", tiers: [1, 10, 50], name: () => t("Два формата"), goal: (n) => t("И читать, и слушать в один день: {days}", { days: days(n) }) },
  { id: "weekend", tiers: [1, 5, 20], name: () => t("Выходные с книгой"), goal: (n) => t("Провести с книгой и субботу, и воскресенье: {n} {weekends}", { n, weekends: pl(n, "раз|раза|раз") }) },
  { id: "classics", tiers: [1, 3, 10], name: () => t("Классика"), goal: (n) => t("Дочитать или дослушать из магазина {books}", { books: books(n) }) },
  { id: "authors", tiers: [3, 10, 25], name: () => t("Знакомства"), goal: (n) => t("Провести хотя бы полчаса с книгами {n} {authors}", { n, authors: pl(n, "автора|авторов|авторов") }) },
  { id: "days", tiers: [30, 100, 365], name: () => t("Дни с книгой"), goal: (n) => t("Набрать {days} с книгами", { days: days(n) }) },
  { id: "collection", tiers: [10, 25, 100], name: () => t("Своя библиотека"), goal: (n) => t("Собрать {books} на полке", { books: books(n) }) },
  { id: "bookmarks", tiers: [5, 25, 100], name: () => t("Закладки"), goal: (n) => t("Оставить {n} {marks}", { n, marks: pl(n, "закладку|закладки|закладок") }) },
  { id: "newyear", tiers: [1], secret: true, name: () => t("Под бой курантов"), goal: () => t("Провести с книгой 31 декабря или 1 января") },
  { id: "comeback", tiers: [1], secret: true, name: () => t("С возвращением"), goal: () => t("Вернуться к книгам после месяца перерыва") },
];

/** Names of the levels by their count: a single-level achievement is gold. */
export function levelName(def: AchievementDef, level: number): string {
  const names = [t("бронза"), t("серебро"), t("золото"), t("изумруд"), t("рубин")];
  if (def.tiers.length === 1) return names[2];
  return names[Math.max(0, Math.min(level, names.length) - 1)];
}

/** The badge's metal for a level (1-based); 0 is a locked badge. */
export function metalOf(def: AchievementDef, level: number): number {
  if (level <= 0) return 0;
  return def.tiers.length === 1 ? 3 : Math.min(level, 5);
}

const MIN_ACTIVE = 60;

const prevDay = (day: string) => {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const between = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);
const dayOf = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** The first author of a book's author line («Ильф, Петров» → «Ильф»); unknown authors don't count. */
function authorOf(name: string): string | null {
  const a = name.split(/[,;&]| и | and /)[0]?.trim().toLowerCase(); // i18n-ignore
  return a && !/неизвестн|unknown/i.test(a) ? a : null; // i18n-ignore
}

export interface AchievementInput {
  rows: ActivityRecord[];
  /** When each book on the shelf was added (ms). */
  added: number[];
  /** When each bookmark was made (ms). */
  bookmarks: number[];
}

/** Every achievement's value, level and the days its levels were reached. */
export function achievements({ rows, added, bookmarks }: AchievementInput): AchievementState[] {
  const state = new Map<AchievementIcon, AchievementState>(ACHIEVEMENTS.map((def) => [def.id, { def, value: 0, level: 0, earned: [] }]));
  const set = (id: AchievementIcon, value: number, day: string) => {
    const s = state.get(id)!;
    s.value = Math.max(s.value, value);
    while (s.level < s.def.tiers.length && s.value >= s.def.tiers[s.level]) {
      s.earned.push(day);
      s.level++;
    }
  };

  // Day by day, in order, so each level gets the day it was reached.
  const byDay = new Map<string, ActivityRecord[]>();
  for (const r of rows) {
    const list = byDay.get(r.day);
    if (list) list.push(r);
    else byDay.set(r.day, [r]);
  }
  const finished = new Set<string>();
  const classics = new Set<string>();
  const perBook = new Map<string, number>();
  const authors = new Set<string>();
  const active = new Set<string>();
  let total = 0, listen = 0, pages = 0, saved = 0, bothDays = 0, weekends = 0, run = 0, newYear = 0, comebacks = 0;
  let last = "";

  for (const day of [...byDay.keys()].sort()) {
    let daySeconds = 0, dayListen = 0, dayRead = 0;
    for (const r of byDay.get(day)!) {
      daySeconds += r.seconds;
      if (r.kind === "listen") {
        dayListen += r.seconds;
        saved += Math.max(0, r.audioSeconds - r.seconds);
      } else {
        dayRead += r.seconds;
        pages += r.pages;
      }
      if (r.finished) {
        finished.add(r.bookKey);
        if (r.bookKey.startsWith("store:")) classics.add(r.bookKey);
      }
      const spent = (perBook.get(r.bookKey) ?? 0) + r.seconds;
      perBook.set(r.bookKey, spent);
      const a = spent >= 30 * 60 ? authorOf(r.author) : null;
      if (a) authors.add(a);
    }
    total += daySeconds;
    listen += dayListen;

    if (daySeconds >= MIN_ACTIVE) {
      if (last && between(last, day) > 30) comebacks++;
      run = active.has(prevDay(day)) ? run + 1 : 1;
      active.add(day);
      last = day;
      if (dayListen >= MIN_ACTIVE && dayRead >= MIN_ACTIVE) bothDays++;
      // A Sunday after an active Saturday.
      if (new Date(`${day}T12:00:00`).getDay() === 0 && active.has(prevDay(day))) weekends++;
      if (day.endsWith("-12-31") || day.endsWith("-01-01")) newYear++;
      set("steps", 1, day);
      set("streak", run, day);
      set("marathon", Math.floor(daySeconds / 3600), day);
      set("both", bothDays, day);
      set("weekend", weekends, day);
      set("days", active.size, day);
      set("newyear", newYear, day);
      set("comeback", comebacks, day);
    }
    set("finished", finished.size, day);
    set("classics", classics.size, day);
    set("hours", Math.floor(total / 3600), day);
    set("listener", Math.floor(listen / 3600), day);
    set("speed", Math.floor(saved / 3600), day);
    set("pages", pages, day);
    set("authors", authors.size, day);
  }

  // The shelf and the bookmarks, by when they were added.
  [...added].sort((a, b) => a - b).forEach((at, i) => set("collection", i + 1, dayOf(at)));
  [...bookmarks].sort((a, b) => a - b).forEach((at, i) => set("bookmarks", i + 1, dayOf(at)));
  return [...state.values()];
}

/** The next level's threshold, or null when all are reached. */
export function nextTier(s: AchievementState): number | null {
  return s.def.tiers[s.level] ?? null;
}

/** 0..1 of the way from the reached level to the next one. */
export function towardNext(s: AchievementState): number {
  const next = nextTier(s);
  if (next === null) return 1;
  const from = s.def.tiers[s.level - 1] ?? 0;
  return Math.max(0, Math.min(1, (s.value - from) / (next - from)));
}

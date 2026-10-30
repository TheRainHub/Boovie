/**
 * Interface language: Russian (the source text) or English.
 *
 * Strings are written in Russian right where they are used and looked up in `EN` when the interface is English:
 * `t("Магазин")`, `t("Глава {n} из {total}", { n, total })`, `pl(n, "книга|книги|книг")`. The static HTML is
 * Russian, so the client renders Russian until it has hydrated; then the app shell re-mounts the page in the chosen
 * language (`useLang`), and does the same when the language is switched in the settings. That lets render code,
 * event handlers and library code alike just call `t`.
 */
import { useSyncExternalStore } from "react";
import { EN } from "./en";

export type Lang = "ru" | "en";

const KEY = "boowie-lang";
let chosen: Lang | null = null;
let hydrated = false;
const listeners = new Set<() => void>();

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    /* no storage */
  }
  const langs = typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language];
  // Russian for readers of Russian (and of the languages whose speakers mostly read it too), English for the rest.
  return !langs.length || langs.some((l) => /^(ru|uk|be|kk|ky|uz|tg|hy|az|ka)\b/i.test(l)) ? "ru" : "en";
}

export function getLang(): Lang {
  if (typeof window === "undefined" || !hydrated) return "ru";
  return (chosen ??= initial());
}

const emit = () => listeners.forEach((fn) => fn());

/** Called once the app has hydrated: from now on the chosen language is used. */
export function markHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  document.documentElement.lang = getLang();
  if (getLang() !== "ru") emit();
}

export function setLang(lang: Lang): void {
  chosen = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* the choice lasts until the app is closed */
  }
  document.documentElement.lang = lang;
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, () => "ru");
}

/** `ru-RU` or `en-US`, for dates and numbers. */
export function locale(): string {
  return getLang() === "en" ? "en-US" : "ru-RU";
}

function fill(s: string, vars?: Record<string, string | number>): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** The interface text in the current language. Unknown strings stay Russian (the test lists them). */
export function t(ru: string, vars?: Record<string, string | number>): string {
  return fill(getLang() === "en" ? (EN[ru] ?? ru) : ru, vars);
}

/** Books imported without an author got this name, in the interface language of the moment. */
export function isUnknownAuthor(author: string): boolean {
  return author === "Неизвестный автор" || author === EN["Неизвестный автор"]; // i18n-ignore
}

/** The word for a count: `pl(5, "книга|книги|книг")` → «книг» / «books». English forms come from `EN`. */
export function pl(n: number, ruForms: string): string {
  if (getLang() === "en") {
    const [one, other = one] = (EN[ruForms] ?? ruForms).split("|");
    return Math.abs(n) === 1 ? one : other;
  }
  const [one, few = one, many = few] = ruForms.split("|");
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

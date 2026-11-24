/**
 * Interface language: Russian (the source text) or English.
 *
 * Strings are written in Russian right where they are used and looked up in `EN` when the interface is English:
 * `t("Магазин")`, `t("Глава {n} из {total}", { n, total })`, `pl(n, "книга|книги|книг")`.
 *
 * On the web each language is a site of its own, prerendered in it: Russian at the root, English under `/en/`
 * (scripts/build-site.mjs). A script in the page's head sends a visitor to the right one before anything shows —
 * by the language chosen in the settings, or else the browser's — so a page is in one language from its first
 * paint. Switching in the settings opens the same page of the other site.
 *
 * The apps carry one local copy (the Russian one): there the language is chosen on the device, and after hydration
 * the app shell re-mounts the page in it (`useLang`), as it does when the language is switched in the settings.
 * That lets render code, event handlers and library code alike just call `t`.
 */
import { useSyncExternalStore } from "react";
import { BASE_PATH, SITE_LANG } from "../basePath";
import { LANG_KEY, RUSSIAN_READERS } from "./detect";
import { EN } from "./en";

export { LANG_KEY, RUSSIAN_READERS } from "./detect";

export type Lang = "ru" | "en";

const KEY = LANG_KEY;
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
  return !langs.length || langs.some((l) => RUSSIAN_READERS.test(l)) ? "ru" : "en";
}

/** In the apps the language is chosen on the device; on the web it is the site's own. */
let onDevice: boolean | null = null;
function chosenOnDevice(): boolean {
  if (onDevice === null) {
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    onDevice = !!cap?.isNativePlatform?.();
  }
  return onDevice;
}

export function getLang(): Lang {
  if (typeof window === "undefined" || !hydrated || !chosenOnDevice()) return SITE_LANG;
  return (chosen ??= initial());
}

const emit = () => listeners.forEach((fn) => fn());

/** Called once the app has hydrated: in the apps, from now on the chosen language is used. */
export function markHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  document.documentElement.lang = getLang();
  if (getLang() !== SITE_LANG) emit();
}

/** The same page of the other language's site (with its query and anchor). */
export function pageIn(lang: Lang, loc: Pick<Location, "pathname" | "search" | "hash"> = location): string {
  const en = `${BASE_PATH}/en`;
  let rest = loc.pathname;
  if (rest === en || rest.startsWith(`${en}/`)) rest = rest.slice(en.length);
  else if (BASE_PATH && (rest === BASE_PATH || rest.startsWith(`${BASE_PATH}/`))) rest = rest.slice(BASE_PATH.length);
  return `${lang === "en" ? en : BASE_PATH}${rest || "/"}${loc.search}${loc.hash}`;
}

export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* the choice lasts until the app is closed */
  }
  if (!chosenOnDevice()) {
    // The web: the other language is the other site.
    if (lang !== SITE_LANG) location.assign(pageIn(lang));
    return;
  }
  chosen = lang;
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
  return useSyncExternalStore(subscribe, getLang, () => SITE_LANG);
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

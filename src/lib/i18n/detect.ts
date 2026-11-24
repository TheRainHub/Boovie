/**
 * What the language choice rests on, for the page's head script (src/app/layout.tsx) and the app alike: the
 * language chosen in the settings is kept under `LANG_KEY`; without one, readers of Russian (and of the languages
 * whose speakers mostly read it too) get Russian and the rest English.
 */
export const LANG_KEY = "boowie-lang";

export const RUSSIAN_READERS = /^(ru|uk|be|kk|ky|uz|tg|hy|az|ka)\b/i;

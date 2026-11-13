"use client";

/**
 * The reader's dictionary: Russian words explained in Russian and English words in Russian, from Wiktionary
 * (CC BY-SA 4.0; built by scripts/dictionary/build_dict.py). The data lives in the account files service
 * (workers/files, `/dict/…`): an index per language and a pack of small compressed shards. A lookup reads only the
 * shard its word is in (an HTTP Range request) and keeps it on the device, so words looked up before — and their
 * neighbours — are there without a connection.
 *
 * An inflected form leads to its word («кавалеристом» → «кавалерист», «went» → «go»); a word that is several
 * words' form («стали» → «сталь», «стать») shows them all.
 */
import { getDB } from "../storage/db";

/** The dictionary build: its files never change, a new build gets a new version (and the device's copy goes with it). */
const VERSION = "v2";
const BASE = `${(process.env.NEXT_PUBLIC_FILES_URL ?? "https://boowie-files.theraintv94.workers.dev").replace(/\/+$/, "")}/dict/${VERSION}`;

export type DictLang = "ru" | "en";

export interface DictMeaning {
  /** The meaning: an explanation, or Russian translations of an English word's meaning. */
  d: string;
  /** For translations: which meaning of the English word they are for («not imprisoned»). */
  h?: string;
  /** The English definition, where no Russian translation is known. */
  en?: 1;
  /** Usage labels: «устар.», «разг.», «перен.». */
  l?: string[];
  /** An example, its translation (English) or its source (Russian). */
  x?: string;
  t?: string;
  r?: string;
}

export interface DictEntry {
  /** Set on a lookup's result: the word in the text is a form of this one («went» of «go»). */
  form?: boolean;
  /** The word; `s` with its stress mark when known. */
  w: string;
  s?: string;
  /** Part of speech and grammar («сущ.», «м.»), transcription. */
  p: string;
  g?: string;
  i?: string;
  m: DictMeaning[];
}

export interface DictResult {
  lang: DictLang;
  /** The word as it is in the text, and the dictionary words it is (or is a form of). */
  word: string;
  entries: DictEntry[];
}

interface Index {
  shards: Record<string, [number, number]>;
}

interface Shard {
  e: Record<string, DictEntry[]>;
  f: Record<string, string[]>;
}

export class DictionaryError extends Error {}

/** Lower case, no stress marks, «ё» as «е», straight apostrophes — the dictionary's keys. */
export function dictKey(word: string): string {
  return word.normalize("NFC").replace(/[\u0300\u0301]/g, "").toLowerCase().replace(/ё/g, "е").replace(/[’ʼ`]/g, "'").trim(); // i18n-ignore
}

export function langOf(word: string): DictLang | null {
  if (/[а-яё]/i.test(word)) return "ru";
  if (/[a-z]/i.test(word)) return "en";
  return null;
}

const memory = new Map<string, Promise<unknown>>();

/** A stored piece of the dictionary, or fetched (and stored) once. */
function cached<T>(name: string, fetcher: () => Promise<T>): Promise<T> {
  const id = `${VERSION}:${name}`;
  let p = memory.get(id) as Promise<T> | undefined;
  if (!p) {
    p = (async () => {
      const db = getDB();
      const hit = await db.dict.get(id).catch(() => undefined);
      if (hit) return hit.data as T;
      const data = await fetcher();
      await db.dict.put({ id, data }).catch(() => undefined);
      return data;
    })();
    p.catch(() => memory.delete(id));
    memory.set(id, p);
  }
  return p;
}

async function get(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, init);
  } catch {
    throw new DictionaryError("offline");
  }
  if (!res.ok) throw new DictionaryError(`HTTP ${res.status}`);
  return res;
}

function index(lang: DictLang): Promise<Index> {
  return cached(`${lang}:index`, async () => {
    const data = (await (await get(`${lang}.index.json`)).json()) as Index;
    return { shards: data.shards };
  });
}

async function gunzip(blob: Blob): Promise<unknown> {
  if (typeof DecompressionStream === "undefined") throw new DictionaryError("unsupported");
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

/** The shard a key is in: the longest shard name that starts it. */
async function shardFor(lang: DictLang, key: string): Promise<Shard> {
  const { shards } = await index(lang);
  for (let n = key.length; n > 0; n--) {
    const name = key.slice(0, n);
    const at = shards[name];
    if (!at) continue;
    return cached(`${lang}:${name}`, async () => {
      const [offset, length] = at;
      const res = await get(`${lang}.pack`, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
      let blob = await res.blob();
      // A server that ignored the range sent the whole pack.
      if (res.status === 200 && blob.size > length) blob = blob.slice(offset, offset + length);
      return (await gunzip(blob)) as Shard;
    });
  }
  return { e: {}, f: {} };
}

/** English endings to try when a form isn't listed: «walked» → «walk», «stories» → «story», «running» → «run». */
function englishStems(key: string): string[] {
  const out: string[] = [];
  const add = (s: string) => s.length > 1 && !out.includes(s) && out.push(s);
  const rules: [RegExp, string[]][] = [
    [/ies$/, ["y"]], [/ied$/, ["y"]], [/ier$/, ["y"]], [/iest$/, ["y"]], [/ily$/, ["y"]],
    [/sses$/, ["ss"]], [/(x|ch|sh|z)es$/, ["$1"]], [/s$/, [""]], [/'s$/, [""]], [/s'$/, [""]],
    [/ed$/, ["", "e"]], [/ing$/, ["", "e"]], [/er$/, ["", "e"]], [/est$/, ["", "e"]], [/ly$/, [""]], [/ness$/, [""]],
  ];
  for (const [re, ends] of rules) {
    if (!re.test(key)) continue;
    for (const end of ends) {
      const stem = key.replace(re, end);
      add(stem);
      // A doubled consonant: «stopped» → «stop», «running» → «run».
      const m = /([bcdfgklmnprstvz])\1$/.exec(stem);
      if (m) add(stem.slice(0, -1));
    }
  }
  return out;
}

/** Russian particles that aren't part of the word: «кто-то», «скажи-ка». */
function russianStems(key: string): string[] {
  const out: string[] = [];
  for (const suffix of ["-то", "-либо", "-нибудь", "-ка", "-таки", "-де", "-с"]) { // i18n-ignore
    if (key.endsWith(suffix) && key.length > suffix.length + 1) out.push(key.slice(0, -suffix.length));
  }
  return out;
}

async function entriesFor(lang: DictLang, key: string): Promise<{ own: DictEntry[]; forms: string[] }> {
  const shard = await shardFor(lang, key);
  return { own: shard.e[key] ?? [], forms: shard.f[key] ?? [] };
}

/**
 * Look a word up. `word` is as it stands in the text: a word written in lower case doesn't bring up names
 * («ran» is the verb, not the name «Ran»).
 */
export async function lookup(word: string): Promise<DictResult | null> {
  const clean = word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
  const lang = langOf(clean);
  if (!lang || clean.length > 40) return null;
  const key = dictKey(clean);
  const lower = clean === clean.toLowerCase();

  const found: DictEntry[] = [];
  const seen = new Set<string>();
  const take = (list: DictEntry[], form: boolean) => {
    for (const e of list) {
      const id = `${e.w}|${e.p}|${e.m[0]?.d}`;
      if (seen.has(id)) continue;
      seen.add(id);
      found.push(form ? { ...e, form: true } : e);
    }
  };
  const search = async (k: string, stem = false) => {
    const { own, forms } = await entriesFor(lang, k);
    take(own, stem);
    for (const lemma of forms.slice(0, 4)) take((await entriesFor(lang, lemma)).own, true);
  };

  await search(key);
  if (!found.length) {
    for (const stem of lang === "en" ? englishStems(key) : russianStems(key)) {
      await search(stem, true);
      if (found.length) break;
    }
  }
  // Names only when the word is capitalised in the text (or nothing else is there).
  const isName = (e: DictEntry) => e.w[0] !== e.w[0]?.toLowerCase() || e.p === "имя собств."; // i18n-ignore
  const common = found.filter((e) => !isName(e));
  const entries = lower && common.length ? common : found;
  // What a Russian reader can read first: words with Russian meanings before those with English definitions only.
  const russian = (e: DictEntry) => e.m.some((m) => !m.en);
  const ordered = [...entries.filter(russian), ...entries.filter((e) => !russian(e))];
  return { lang, word: clean, entries: ordered.slice(0, 5) };
}

/** Wiktionary's page for a word, for «more». */
export function wiktionaryUrl(word: string): string {
  return `https://ru.wiktionary.org/wiki/${encodeURIComponent(word)}`;
}

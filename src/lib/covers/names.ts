/**
 * Title / author from file and folder names, for books without usable tags and for cover search queries.
 *   "Сапковский Анджей - Владычица озера (2010) [MP3 128kbps]"  → { author: "Сапковский Анджей", title: "Владычица озера" }
 *   "Владычица озера, часть 1.m4b"                               → { title: "Владычица озера" }
 */

// JS \b only knows ASCII word characters, so Cyrillic needs explicit Unicode boundaries.
const B = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const NOISE = [
  /\[[^\]]*\]/gu, // [MP3 128kbps], [Читает Иванов]
  /\((?:\d{4}|[^)]*(?:kbps|кбит|mp3|m4b|aac|flac|аудиокниг|audiobook|читает|чит\.|reads?)[^)]*)\)/giu,
  new RegExp(`${B}\\d{2,3}\\s*(?:kbps|кбит/?с?)${E}`, "giu"),
  new RegExp(`${B}(?:mp3|m4b|m4a|aac|flac|ogg|opus)${E}`, "giu"),
  new RegExp(`${B}(?:аудиокнига|audiobook|unabridged)${E}`, "giu"),
];
const PART = new RegExp(
  `[,.\\s_-]*${B}(?:часть|част\\.|ч\\.|part|pt\\.?|том|т\\.|vol\\.?|volume|книга|book|cd|disc|disk|диск)[\\s_-]*[\\divxlc]+${E}.*$`,
  "iu",
);
const LEADING_TRACK = /^\s*(?:\d{1,4}|[a-z]?\d{1,3})\s*[-._)\s]+(?=\D)/iu;

export function stripExt(name: string): string {
  return name.replace(/\.(fb2\.zip|[a-z0-9]{2,5})$/i, "");
}

/** Remove release noise, part numbers and separators; keep the work's name. */
export function cleanTitle(raw: string): string {
  let s = stripExt(raw).replace(/[_]+/g, " ");
  for (const rx of NOISE) s = s.replace(rx, " ");
  s = s.replace(LEADING_TRACK, "");
  s = s.replace(PART, "");
  s = s.replace(/\s{2,}/g, " ").replace(/^[\s.,:;–—-]+|[\s.,:;–—-]+$/g, "").trim();
  return s || stripExt(raw).trim();
}

/** "Автор - Название" (folder convention) → parts; returns null when there is no separator. */
export function splitAuthorTitle(raw: string): { author: string; title: string } | null {
  const s = cleanTitle(raw);
  const m = /^(.{2,60}?)\s+[-–—]\s+(.{2,})$/u.exec(s);
  if (!m) return null;
  return { author: m[1].trim(), title: m[2].trim() };
}

const normalizeForMatch = (s: string) =>
  s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** Token overlap in [0, 1] — used to rank cover search results against the book. */
export function similarity(a: string, b: string): number {
  const A = new Set(normalizeForMatch(a).split(" ").filter((t) => t.length > 1));
  const B = new Set(normalizeForMatch(b).split(" ").filter((t) => t.length > 1));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const t of A) if (B.has(t)) common++;
  return common / Math.max(A.size, B.size);
}

export function surname(author: string | undefined): string {
  if (!author) return "";
  const parts = normalizeForMatch(author).split(" ").filter(Boolean);
  // "Анджей Сапковский" and "Сапковский Анджей" both match on the longest token.
  return parts.sort((x, y) => y.length - x.length)[0] ?? "";
}

/**
 * Builds an audiobook from one or many audio files.
 *  - One file: embedded chapters (ID3 CHAP / MP4 chapters) or, if absent and the file is long, 20-minute markers.
 *  - Many files: sorted by disc/track tags when every file has them, otherwise naturally by filename;
 *    every file becomes a chapter (or several, if it carries its own chapter marks).
 */
import { splitAuthorTitle, surname, tidyName } from "../covers/names";
import { readAudioMetadata, type AudioMetadata } from "./audioMetadata";
import { mimeFromName, naturalCompare, stripExtension } from "./text";
import { ParseError, type ParsedBook, type ParsedChapter, type ProgressFn } from "./types";

export const AUTO_CHAPTER_SECONDS = 20 * 60;

export interface AudioInput {
  blob: Blob;
  name: string;
  /** Path inside a picked folder/archive ("CD2/01.mp3"): orders untagged files across disc subfolders. */
  path?: string;
}

export interface AudioParseOptions {
  /** Fallback when the container has no readable duration (ogg/wav/flac/…): typically an <audio> probe. */
  probeDuration?: (blob: Blob) => Promise<number>;
  /** Title/author derived from the folder name ("Автор - Название"), used when tags don't provide them. */
  hint?: { title?: string; author?: string };
}

function commonPrefix(names: string[]): string {
  if (names.length === 0) return "";
  let p = names[0];
  for (const n of names.slice(1)) {
    while (p && !n.startsWith(p)) p = p.slice(0, -1);
  }
  return p.replace(/[\s\d._\-–—()[\]#]+$/u, "").trim();
}

/**
 * MIME type to store with the file: blob: URLs are played by the type they carry, and iOS reports .m4b/.m4a as
 * audio/x-m4b / audio/x-m4a, which Safari may refuse. Known extensions win over the browser-reported type.
 */
export function playableMime(input: AudioInput): string {
  const byName = mimeFromName(input.name);
  return byName !== "application/octet-stream" ? byName : input.blob.type || "audio/mpeg";
}

/** "01 Prologue.mp3" → "Prologue", "03. Глава третья.mp3" → "Глава третья"; bare numbers are kept ("07"). */
export function chapterTitleFromFile(name: string): string {
  const base = stripExtension(name).replace(/_/g, " ").trim();
  const stripped = base.replace(/^\s*\d{1,3}\s*[-._)]?\s+(?=\S)/u, "");
  return /\p{L}/u.test(stripped) ? stripped : base;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** "Часть 3", "Глава первая", "Track 07", "07": the name of a piece, not of a book. */
const PIECE = /^(?:(?:часть|глава|том|книга|трек|запись|файл|диск|part|chapter|track|book|volume|disc|cd)(?:[\s._-]+\S+)?|[\divxlc\s._-]*)$/iu;

/** `name` contains `base` as whole words and says more: "Ведьмак 1. Последнее желание" over "Ведьмак". */
function extendsName(name: string, base: string): boolean {
  const n = norm(name);
  const b = norm(base);
  return !!b && n !== b && ` ${n} `.includes(` ${b} `);
}

/** "Анджей Сапковский - Последнее желание" → "Последнее желание" when the left side names the author. */
function withoutAuthor(name: string, author?: string): string {
  const m = /^(.{2,60}?)\s+[-–—]\s+(.{2,})$/u.exec(name);
  const key = surname(author);
  return m && key && norm(m[1]).split(" ").includes(key) ? m[2].trim() : name;
}

/**
 * The book's name. The album tag usually is it, but a series or collection tagged as one album ("Ведьмак") names
 * each book in the title tag, the file or the folder ("Ведьмак 1. Последнее желание"): a name that contains the
 * album and says more wins, and so does a title tag that the file name repeats.
 */
export function audioBookTitle(c: { album?: string; tag?: string; file?: string; folder?: string; author?: string }): string {
  const clean = (s: string | undefined, file: boolean) => (s?.trim() ? withoutAuthor(tidyName(s, file), c.author) : "");
  const album = clean(c.album, false);
  const tag = clean(c.tag, false);
  const file = clean(c.file, true);
  const folder = c.folder?.trim() ?? "";
  const named = [folder, tag, file].filter((n) => n && !PIECE.test(n));
  if (album) {
    const more = named.find((n) => extendsName(n, album));
    if (more) return more;
    if (tag && file && !PIECE.test(tag) && norm(tag) !== norm(album) && (norm(tag) === norm(file) || extendsName(file, tag))) return tag;
    return album;
  }
  return named[0] || folder || tag || file || "Без названия";
}

export function autoChapters(duration: number, step = AUTO_CHAPTER_SECONDS): { title: string; start: number; duration: number }[] {
  const out = [];
  const count = Math.max(1, Math.ceil(duration / step - 0.05)); // avoid a sliver part for e.g. 40:01
  for (let i = 0; i < count; i++) {
    const start = i * step;
    const end = i === count - 1 ? duration : Math.min(duration, start + step);
    out.push({ title: `Часть ${i + 1}`, start, duration: end - start });
  }
  return out;
}

export async function parseAudio(inputs: AudioInput[], onProgress?: ProgressFn, opts: AudioParseOptions = {}): Promise<ParsedBook> {
  if (inputs.length === 0) throw new ParseError("Не выбраны аудиофайлы");
  const metas: { input: AudioInput; meta: AudioMetadata }[] = [];
  for (let i = 0; i < inputs.length; i++) {
    onProgress?.(0.05 + 0.85 * (i / inputs.length), `Чтение тегов: ${inputs[i].name}`);
    const meta = await readAudioMetadata(inputs[i].blob).catch((): AudioMetadata => ({ container: "unknown", chapters: [] }));
    if (meta.encrypted) {
      throw new ParseError(`«${inputs[i].name}» защищён DRM (Apple FairPlay) и воспроизводится только в Apple Books. Нужна версия без защиты.`);
    }
    if (!meta.duration && opts.probeDuration) {
      meta.duration = await opts.probeDuration(inputs[i].blob).catch(() => undefined);
    }
    if (!meta.duration || !isFinite(meta.duration)) throw new ParseError(`Не удалось определить длительность: ${inputs[i].name}`);
    metas.push({ input: inputs[i], meta });
  }

  if (metas.length > 1) {
    const tracked = metas.every((m) => m.meta.track) && new Set(metas.map((m) => `${m.meta.disc ?? 1}:${m.meta.track}`)).size === metas.length;
    metas.sort((a, b) =>
      tracked
        ? (a.meta.disc ?? 1) - (b.meta.disc ?? 1) || a.meta.track! - b.meta.track!
        : naturalCompare(a.input.path || a.input.name, b.input.path || b.input.name),
    );
  }

  const chapters: ParsedChapter[] = [];
  let t = 0;
  metas.forEach(({ input, meta }, sourceIndex) => {
    const fileDuration = meta.duration!;
    const marks = meta.chapters.filter((c) => c.start < fileDuration);
    if (marks.length >= 2 || (marks.length === 1 && metas.length === 1 && marks[0].title)) {
      marks.forEach((m, i) => {
        const end = Math.min(fileDuration, marks[i + 1]?.start ?? m.end ?? fileDuration);
        chapters.push({ title: m.title || `Глава ${chapters.length + 1}`, sourceIndex, fileStart: m.start, startTime: t + m.start, duration: end - m.start });
      });
    } else if (metas.length === 1 && fileDuration > AUTO_CHAPTER_SECONDS) {
      for (const part of autoChapters(fileDuration)) {
        chapters.push({ title: part.title, sourceIndex, fileStart: part.start, startTime: t + part.start, duration: part.duration });
      }
    } else {
      chapters.push({ title: meta.title || chapterTitleFromFile(input.name), sourceIndex, fileStart: 0, startTime: t, duration: fileDuration });
    }
    t += fileDuration;
  });

  const first = metas[0].meta;
  const hint = opts.hint ?? {};
  const single = metas.length === 1;
  const albums = [...new Set(metas.map((m) => m.meta.album).filter(Boolean))];
  // A loose untagged file follows the folder convention too: "Автор - Название.mp3".
  const named = single && !hint.author && !first.albumArtist && !first.artist ? splitAuthorTitle(metas[0].input.name, true) : null;
  const author = first.albumArtist || first.artist || hint.author || named?.author || "Неизвестный автор";
  const title = audioBookTitle({
    album: albums.length === 1 ? albums[0] : undefined,
    tag: single ? first.title : undefined,
    file: single ? metas[0].input.name : commonPrefix(metas.map((m) => stripExtension(m.input.name))) || undefined,
    folder: hint.title,
    author,
  }) || stripExtension(metas[0].input.name);
  onProgress?.(1);

  return {
    format: "audio",
    title,
    author,
    narrator: first.composer,
    cover: metas.find((m) => m.meta.cover)?.meta.cover,
    chapters,
    assets: [],
    sources: metas.map(({ input }) => ({ blob: input.blob, name: input.name, mime: playableMime(input) })),
    duration: t,
  };
}

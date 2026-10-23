/**
 * Builds an audiobook from one or many audio files.
 *  - One file: embedded chapters (ID3 CHAP / MP4 chapters) or, if absent and the file is long, 20-minute markers.
 *  - Many files: sorted by disc/track tags when every file has them, otherwise naturally by filename;
 *    every file becomes a chapter (or several, if it carries its own chapter marks).
 */
import { readAudioMetadata, type AudioMetadata } from "./audioMetadata";
import { mimeFromName, naturalCompare, stripExtension } from "./text";
import { ParseError, type ParsedBook, type ParsedChapter, type ProgressFn } from "./types";

export const AUTO_CHAPTER_SECONDS = 20 * 60;

export interface AudioInput {
  blob: Blob;
  name: string;
}

export interface AudioParseOptions {
  /** Fallback when the container has no readable duration (ogg/wav/flac/…): typically an <audio> probe. */
  probeDuration?: (blob: Blob) => Promise<number>;
}

function commonPrefix(names: string[]): string {
  if (names.length === 0) return "";
  let p = names[0];
  for (const n of names.slice(1)) {
    while (p && !n.startsWith(p)) p = p.slice(0, -1);
  }
  return p.replace(/[\s\d._\-–—()[\]#]+$/u, "").trim();
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
        : naturalCompare(a.input.name, b.input.name),
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
      chapters.push({ title: meta.title || stripExtension(input.name), sourceIndex, fileStart: 0, startTime: t, duration: fileDuration });
    }
    t += fileDuration;
  });

  const first = metas[0].meta;
  const albums = [...new Set(metas.map((m) => m.meta.album).filter(Boolean))];
  const title = metas.length === 1
    ? first.album || first.title || stripExtension(metas[0].input.name)
    : albums.length === 1 ? albums[0]! : commonPrefix(metas.map((m) => stripExtension(m.input.name))) || stripExtension(metas[0].input.name);
  const author = first.albumArtist || first.artist || "Неизвестный автор";
  onProgress?.(1);

  return {
    format: "audio",
    title,
    author,
    narrator: first.composer,
    cover: metas.find((m) => m.meta.cover)?.meta.cover,
    chapters,
    assets: [],
    sources: metas.map(({ input }) => ({ blob: input.blob, name: input.name, mime: input.blob.type || mimeFromName(input.name) })),
    duration: t,
  };
}

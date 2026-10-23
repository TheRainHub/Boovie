import type { AudioParseOptions } from "./audioParser";
import { ParseError, type ParsedBook, type ProgressFn } from "./types";

export type DetectedKind = "epub" | "fb2" | "pdf" | "audio" | "unknown";

const AUDIO_EXT = /\.(mp3|m4a|m4b|mp4|aac|ogg|oga|opus|wav|flac|webm)$/i;

export function isAudioName(name: string): boolean {
  return AUDIO_EXT.test(name);
}

/** Detect the format from magic bytes first, file extension second. */
export async function detectKind(file: Blob, name: string): Promise<DetectedKind> {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  const ascii = String.fromCharCode(...head);
  if (ascii.startsWith("%PDF")) return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b) {
    if (ascii.includes("mimetypeapplication/epub+zip") || /\.epub$/i.test(name)) return "epub";
    if (/\.fb2\.zip$/i.test(name) || /\.fb2\b/i.test(ascii)) return "fb2";
    return /\.epub$/i.test(name) ? "epub" : "unknown";
  }
  if (/<FictionBook/i.test(ascii) || /\.fb2$/i.test(name)) return "fb2";
  if (ascii.startsWith("ID3") || ascii.slice(4, 8) === "ftyp" || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return "audio";
  if (ascii.startsWith("OggS") || ascii.startsWith("fLaC") || ascii.startsWith("RIFF")) return "audio";
  if (isAudioName(name)) return "audio";
  if (/\.epub$/i.test(name)) return "epub";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "unknown";
}

export async function parseBookFile(file: Blob, name: string, onProgress?: ProgressFn, audioOpts?: AudioParseOptions): Promise<ParsedBook> {
  const kind = await detectKind(file, name);
  switch (kind) {
    case "epub": return (await import("./epubParser")).parseEpub(file, name, onProgress);
    case "fb2": return (await import("./fb2Parser")).parseFb2(file, name, onProgress);
    case "pdf": return (await import("./pdfParser")).parsePdf(file, name, onProgress);
    case "audio": return (await import("./audioParser")).parseAudio([{ blob: file, name }], onProgress, audioOpts);
    default: throw new ParseError(`Формат не поддерживается: ${name}`);
  }
}

export { ParseError };

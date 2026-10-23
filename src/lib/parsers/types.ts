import type { BookFormat } from "../storage/types";

/** Binary resource referenced from chapter HTML as `<img data-asset="key">`. */
export interface ParsedAsset {
  key: string;
  blob: Blob;
  name: string;
}

export interface ParsedChapter {
  title: string;
  group?: string;
  /** Sanitized HTML (text formats). */
  html?: string;
  charCount?: number;
  /** Audio: index into ParsedBook.sources of the file that holds this chapter. */
  sourceIndex?: number;
  /** Audio: chapter start inside its file, seconds. */
  fileStart?: number;
  /** Audio: chapter start on the whole-book timeline, seconds. */
  startTime?: number;
  duration?: number;
  /** PDF: 1-based inclusive page range. */
  startPage?: number;
  endPage?: number;
}

export interface ParsedSource {
  blob: Blob;
  name: string;
  mime: string;
}

export interface ParsedBook {
  format: BookFormat;
  title: string;
  author: string;
  annotation?: string;
  language?: string;
  narrator?: string;
  cover?: Blob;
  chapters: ParsedChapter[];
  assets: ParsedAsset[];
  sources: ParsedSource[];
  duration?: number;
  pageCount?: number;
}

export type ProgressFn = (fraction: number, label?: string) => void;

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

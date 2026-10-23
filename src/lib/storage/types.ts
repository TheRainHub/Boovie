export type BookFormat = "epub" | "fb2" | "pdf" | "audio";

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  /** Static URL (store books) — the cover blob in `coverFileId` takes precedence when present. */
  coverUrl?: string;
  coverFileId?: string;
  format: BookFormat;
  totalChapters: number;
  addedAt: number;
  fileSize: number;
  isStoreBook: boolean;
  storeId?: string;
  /** Linked edition of the same work in the other medium (text <-> audio), for the Read/Listen toggle. */
  companionId?: string;
  annotation?: string;
  language?: string;
  narrator?: string;
  /** Total audio duration in seconds (audio books). */
  duration?: number;
  /** Page count (PDF). */
  pageCount?: number;
  /** Total characters (text books) — used for whole-book percentage. */
  totalChars?: number;
  /** Original uploaded/downloaded files (PDF document, audio tracks, EPUB/FB2 source). */
  sourceFileIds: string[];
  lastOpenedAt?: number;
}

export interface ChapterRecord {
  /** `${bookId}:${index}` */
  id: string;
  bookId: string;
  index: number;
  title: string;
  /** Title of the enclosing part/section, if the source has nested structure. */
  group?: string;
  /** Sanitized HTML for text books; file id of the audio track for audio books; empty for PDF. */
  contentOrBlobRef: string;
  /** Audio: global start offset (seconds) on the book timeline. */
  startTime?: number;
  duration?: number;
  /** Audio: offset inside the referenced file where the chapter starts. */
  fileStart?: number;
  /** PDF: 1-based first/last page of the chapter. */
  startPage?: number;
  endPage?: number;
  charCount?: number;
}

export type BookmarkKind = "text" | "audio" | "pdf";

export interface Bookmark {
  id: string;
  kind: BookmarkKind;
  chapterIndex: number;
  /** text: fraction 0..1 within the chapter · audio: global seconds · pdf: page number */
  position: number;
  note?: string;
  snippet?: string;
  createdAt: number;
}

export interface ProgressRecord {
  bookId: string;
  currentChapterIndex: number;
  /** text: fraction 0..1 within chapter · pdf: current page number */
  scrollOffsetOrPage: number;
  /** audio: global position in seconds */
  audioTimestamp: number;
  /** 0..100 for the whole book */
  percentage: number;
  updatedAt: number;
  bookmarks: Bookmark[];
  completedChapters: number[];
}

export interface FileRecord {
  id: string;
  bookId: string;
  name: string;
  mime: string;
  size: number;
  role: "source" | "asset" | "cover";
  storage: "opfs" | "idb";
  /** Present when storage === "idb". */
  blob?: Blob;
  createdAt: number;
}

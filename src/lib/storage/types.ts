export type BookFormat = "epub" | "fb2" | "pdf" | "audio";

export interface BookRecord {
  id: string;
  title: string;
  author: string;
  /** Static URL (store books) — the cover blob in `coverFileId` takes precedence when present. */
  coverUrl?: string;
  coverFileId?: string;
  /** Where the cover came from; only generated covers are replaced automatically by an online match. */
  coverSource?: "embedded" | "folder" | "store" | "online" | "generated" | "user";
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

export type ActivityKind = "listen" | "read";

/**
 * One day of reading or listening to one book, on one device. Rows are absolute daily totals, so uploading the
 * same row twice is harmless and an account's numbers are the sum over its devices.
 */
export interface ActivityRecord {
  /** `${owner}|${deviceId}|${day}|${bookKey}|${kind}` */
  id: string;
  /** Account id, or "guest" for time spent while not signed in. */
  owner: string;
  deviceId: string;
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Same book on every device: `store:<id>` for store books, otherwise title, author and medium. */
  bookKey: string;
  kind: ActivityKind;
  title: string;
  author: string;
  /** Time spent, in seconds of real time. */
  seconds: number;
  /** Pages turned forward. */
  pages: number;
  /** Listening: seconds of the book that were played (more than `seconds` at higher speeds). */
  audioSeconds: number;
  /** The book was finished on this day. */
  finished: boolean;
  updatedAt: number;
  /** When this row (as of `updatedAt`) was uploaded to the account. */
  syncedAt?: number;
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

"use client";

/**
 * Global audiobook engine. One HTMLAudioElement lives for the whole app session (outside React), so playback
 * survives route changes. The book is modelled as one continuous timeline: chapters carry their global start,
 * the file that holds them and the offset inside that file — this covers single M4B files with embedded
 * chapters and multi-file MP3 books alike.
 */
import { create } from "zustand";
import { getChapters, getProgress, markChaptersComplete, updateProgress } from "../library/repository";
import { getFileUrl } from "../storage/blobStore";
import { getDB } from "../storage/db";
import { installMediaHandlers, setMediaMetadata, setPlaybackState, setPositionState, SKIP_BACK, SKIP_FORWARD } from "./mediaSession";

export interface PlayerChapter {
  index: number;
  title: string;
  group?: string;
  startTime: number;
  duration: number;
  fileStart: number;
  fileId: string;
}

export type SleepTimer = { kind: "off" } | { kind: "minutes"; minutes: number; endsAt: number } | { kind: "chapter" };

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const SLEEP_PRESETS = [15, 30, 45, 60] as const;

interface PlayerState {
  bookId: string | null;
  title: string;
  author: string;
  narrator?: string;
  cover?: string;
  /** Static (absolute-path) artwork for the lock screen when available. */
  artwork?: string;
  chapters: PlayerChapter[];
  duration: number;
  position: number;
  chapterIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  rate: number;
  sleep: SleepTimer;
  expanded: boolean;
  error?: string;
  setExpanded: (v: boolean) => void;
}

const RATE_KEY = "titan-rate";
const LAST_KEY = "titan-last-audio";

function storedRate(): number {
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    return (RATES as readonly number[]).includes(r) ? r : 1;
  } catch {
    return 1;
  }
}

export const usePlayer = create<PlayerState>((set) => ({
  bookId: null,
  title: "",
  author: "",
  chapters: [],
  duration: 0,
  position: 0,
  chapterIndex: 0,
  isPlaying: false,
  isLoading: false,
  rate: 1,
  sleep: { kind: "off" },
  expanded: false,
  setExpanded: (expanded) => set({ expanded }),
}));

const get = () => usePlayer.getState();
const set = (patch: Partial<PlayerState>) => usePlayer.setState(patch);

let audio: HTMLAudioElement | null = null;
let currentFileId: string | null = null;
let loadToken = 0;
let lastPersist = 0;
let lastPositionState = 0;
// 44-byte silent WAV used to unlock playback on iOS during the first user gesture.
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

function el(): HTMLAudioElement {
  if (audio) return audio;
  const a = new Audio();
  a.preload = "auto";
  a.setAttribute("playsinline", "");
  a.setAttribute("webkit-playsinline", "");
  a.addEventListener("timeupdate", onTime);
  a.addEventListener("play", () => {
    set({ isPlaying: true });
    setPlaybackState("playing");
  });
  a.addEventListener("pause", () => {
    set({ isPlaying: false });
    setPlaybackState("paused");
    void persist(true);
  });
  a.addEventListener("waiting", () => set({ isLoading: true }));
  a.addEventListener("playing", () => set({ isLoading: false }));
  a.addEventListener("canplay", () => set({ isLoading: false }));
  a.addEventListener("ended", onEnded);
  a.addEventListener("error", () => {
    if (a.src && a.src !== SILENT) set({ error: "Не удалось воспроизвести файл", isLoading: false, isPlaying: false });
  });
  audio = a;
  installMediaHandlers({
    play: () => void play(),
    pause: () => pause(),
    stop: () => pause(),
    seekBy: (d) => void skip(d),
    seekToInChapter: (s) => {
      const ch = get().chapters[get().chapterIndex];
      if (ch) void seek(ch.startTime + s);
    },
    previousChapter: () => void prevChapter(),
    nextChapter: () => void nextChapter(),
  });
  return a;
}

/** Call from the first user gesture so later programmatic play() calls are allowed on iOS. */
export function unlockAudio(): void {
  const a = el();
  if (a.src) return;
  a.src = SILENT;
  a.play().then(() => a.pause()).catch(() => undefined);
}

function chapterAtGlobal(t: number): PlayerChapter | undefined {
  const chs = get().chapters;
  let found = chs[0];
  for (const c of chs) {
    if (c.startTime <= t + 0.001) found = c;
    else break;
  }
  return found;
}

function chapterAtFileTime(fileId: string, t: number): PlayerChapter | undefined {
  let found: PlayerChapter | undefined;
  for (const c of get().chapters) {
    if (c.fileId !== fileId) continue;
    if (c.fileStart <= t + 0.05) found = c;
    else if (found) break;
  }
  return found;
}

function updateMediaMetadata(): void {
  const s = get();
  const ch = s.chapters[s.chapterIndex];
  setMediaMetadata({
    title: ch ? ch.title : s.title,
    artist: s.author,
    album: s.title,
    artwork: s.artwork ? new URL(s.artwork, location.origin).href : s.cover,
  });
}

function onTime(): void {
  const a = el();
  const s = get();
  if (!currentFileId || !s.bookId) return;
  const ch = chapterAtFileTime(currentFileId, a.currentTime);
  if (!ch) return;
  const position = ch.startTime + (a.currentTime - ch.fileStart);

  if (ch.index !== s.chapterIndex) {
    const prev = s.chapterIndex;
    set({ chapterIndex: ch.index, position });
    updateMediaMetadata();
    if (ch.index > prev) {
      void markChaptersComplete(s.bookId, [prev]);
      if (s.sleep.kind === "chapter") {
        a.pause();
        set({ sleep: { kind: "off" } });
      }
    }
  } else {
    set({ position });
  }

  // Sleep timer with a 10-second fade-out.
  if (s.sleep.kind === "minutes") {
    const left = (s.sleep.endsAt - Date.now()) / 1000;
    if (left <= 0) {
      a.pause();
      a.volume = 1;
      set({ sleep: { kind: "off" } });
    } else {
      a.volume = left < 10 ? Math.max(0.05, left / 10) : 1;
    }
  }

  const now = Date.now();
  if (now - lastPositionState > 1000) {
    lastPositionState = now;
    setPositionState(ch.duration, position - ch.startTime, a.playbackRate);
  }
  if (now - lastPersist > 5000) void persist();
}

async function persist(force = false): Promise<void> {
  const s = get();
  if (!s.bookId || (!force && Date.now() - lastPersist < 5000)) return;
  lastPersist = Date.now();
  await updateProgress(
    s.bookId,
    { audioTimestamp: s.position, currentChapterIndex: s.chapterIndex, percentage: s.duration ? (s.position / s.duration) * 100 : 0 },
    // Saving a paused book (e.g. when the app is hidden) must not make it «the book you are on» again.
    { touch: s.isPlaying },
  ).catch(() => undefined);
}

async function onEnded(): Promise<void> {
  const s = get();
  const cur = s.chapters[s.chapterIndex];
  if (!cur || !s.bookId) return;
  // Next chapter that lives in a different file (multi-file books).
  const next = s.chapters.find((c) => c.index > cur.index && c.fileId !== currentFileId);
  if (s.sleep.kind === "chapter") set({ sleep: { kind: "off" } });
  if (next) {
    await markChaptersComplete(s.bookId, [cur.index]);
    await seek(next.startTime, { autoplay: s.sleep.kind !== "chapter" });
  } else {
    set({ isPlaying: false, position: s.duration });
    await markChaptersComplete(s.bookId, s.chapters.map((c) => c.index));
    await updateProgress(s.bookId, { audioTimestamp: s.duration, percentage: 100, currentChapterIndex: cur.index });
  }
}

function waitForMetadata(a: HTMLAudioElement): Promise<void> {
  if (a.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("load")); };
    const cleanup = () => {
      a.removeEventListener("loadedmetadata", ok);
      a.removeEventListener("error", fail);
    };
    a.addEventListener("loadedmetadata", ok);
    a.addEventListener("error", fail);
  });
}

export async function seek(global: number, opts: { autoplay?: boolean } = {}): Promise<void> {
  const s = get();
  if (!s.chapters.length) return;
  const t = Math.max(0, Math.min(global, Math.max(0, s.duration - 0.25)));
  const ch = chapterAtGlobal(t);
  if (!ch) return;
  const a = el();
  const wasPlaying = !a.paused;
  const fileTime = ch.fileStart + (t - ch.startTime);
  set({ position: t, chapterIndex: ch.index, error: undefined });
  if (currentFileId !== ch.fileId) {
    const token = ++loadToken;
    set({ isLoading: true });
    const url = await getFileUrl(ch.fileId);
    if (token !== loadToken) return;
    if (!url) {
      set({ error: "Файл аудиокниги не найден на устройстве", isLoading: false });
      return;
    }
    currentFileId = ch.fileId;
    a.src = url;
    a.playbackRate = s.rate;
    a.defaultPlaybackRate = s.rate;
    try {
      await waitForMetadata(a);
    } catch {
      set({ error: "Не удалось открыть аудиофайл", isLoading: false });
      return;
    }
    if (token !== loadToken) return;
    set({ isLoading: false });
  }
  a.currentTime = fileTime;
  updateMediaMetadata();
  setPositionState(ch.duration, t - ch.startTime, a.playbackRate);
  if (opts.autoplay ?? wasPlaying) await a.play().catch(() => set({ isPlaying: false }));
  void persist(true);
}

export async function openAudioBook(bookId: string, opts: { autoplay?: boolean; chapterIndex?: number; time?: number; touch?: boolean } = {}): Promise<void> {
  const a = el();
  const s = get();
  if (s.bookId !== bookId) {
    a.pause();
    const [book, rows, progress] = await Promise.all([getDB().books.get(bookId), getChapters(bookId), getProgress(bookId)]);
    if (!book || book.format !== "audio") return;
    const chapters: PlayerChapter[] = rows.map((r) => ({
      index: r.index,
      title: r.title,
      group: r.group,
      startTime: r.startTime ?? 0,
      duration: r.duration ?? 0,
      fileStart: r.fileStart ?? 0,
      fileId: r.contentOrBlobRef,
    }));
    const cover = book.coverFileId ? (await getFileUrl(book.coverFileId)) ?? book.coverUrl : book.coverUrl;
    currentFileId = null;
    set({
      bookId,
      title: book.title,
      author: book.author,
      narrator: book.narrator,
      cover,
      artwork: book.coverUrl,
      chapters,
      duration: book.duration ?? chapters.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0),
      position: progress.audioTimestamp,
      chapterIndex: progress.currentChapterIndex,
      rate: storedRate(),
      error: undefined,
    });
    try {
      localStorage.setItem(LAST_KEY, bookId);
    } catch {
      /* ignore */
    }
    // Restoring the session or preloading for the home screen is not «opening» the book.
    if (opts.touch !== false) await getDB().books.update(bookId, { lastOpenedAt: Date.now() });
  }
  const st = get();
  const at = opts.time ?? (opts.chapterIndex !== undefined ? st.chapters[opts.chapterIndex]?.startTime : undefined);
  // Restart a finished book from the beginning.
  const start = at ?? (st.position >= st.duration - 1 ? 0 : st.position);
  await seek(start, { autoplay: opts.autoplay ?? false });
}

/** Restore the last book into the mini player (paused) after an app restart. */
export async function restoreLastSession(): Promise<void> {
  if (get().bookId) return;
  let id: string | null = null;
  try {
    id = localStorage.getItem(LAST_KEY);
  } catch {
    /* ignore */
  }
  if (!id) return;
  const book = await getDB().books.get(id);
  if (!book) return;
  await openAudioBook(id, { autoplay: false, touch: false });
}

export async function play(): Promise<void> {
  const a = el();
  const s = get();
  if (!s.bookId) return;
  if (!currentFileId || a.src === SILENT || !a.src) {
    await seek(s.position >= s.duration - 1 ? 0 : s.position, { autoplay: true });
    return;
  }
  await a.play().catch(() => set({ isPlaying: false }));
}

export function pause(): void {
  el().pause();
}

export function toggle(): void {
  if (get().isPlaying) pause();
  else void play();
}

export function skip(delta: number): Promise<void> {
  return seek(get().position + delta);
}
export const skipBack = () => skip(-SKIP_BACK);
export const skipForward = () => skip(SKIP_FORWARD);

export function seekInChapter(fraction: number): Promise<void> {
  const s = get();
  const ch = s.chapters[s.chapterIndex];
  return ch ? seek(ch.startTime + fraction * ch.duration) : Promise.resolve();
}

export function playChapter(index: number): Promise<void> {
  const ch = get().chapters[index];
  return ch ? seek(ch.startTime, { autoplay: true }) : Promise.resolve();
}

export function nextChapter(): Promise<void> {
  const s = get();
  const next = s.chapters[s.chapterIndex + 1];
  return next ? seek(next.startTime) : Promise.resolve();
}

export function prevChapter(): Promise<void> {
  const s = get();
  const ch = s.chapters[s.chapterIndex];
  if (!ch) return Promise.resolve();
  // Like a CD player: first press returns to the chapter start.
  if (s.position - ch.startTime > 3 || s.chapterIndex === 0) return seek(ch.startTime);
  return seek(s.chapters[s.chapterIndex - 1].startTime);
}

export function setRate(rate: number): void {
  const a = el();
  a.playbackRate = rate;
  a.defaultPlaybackRate = rate;
  set({ rate });
  try {
    localStorage.setItem(RATE_KEY, String(rate));
  } catch {
    /* ignore */
  }
}

export function setSleepTimer(timer: { kind: "off" } | { kind: "minutes"; minutes: number } | { kind: "chapter" }): void {
  el().volume = 1;
  set({ sleep: timer.kind === "minutes" ? { ...timer, endsAt: Date.now() + timer.minutes * 60_000 } : timer });
}

export function closePlayer(): void {
  const a = el();
  a.pause();
  void persist(true);
  a.removeAttribute("src");
  a.load();
  currentFileId = null;
  set({ bookId: null, chapters: [], expanded: false, isPlaying: false, position: 0 });
  try {
    localStorage.removeItem(LAST_KEY);
  } catch {
    /* ignore */
  }
  if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
}

/** Stop and forget if the given book is loaded (used before deleting it). */
export function unloadIfCurrent(bookId: string): void {
  if (get().bookId === bookId) closePlayer();
}

export function persistNow(): Promise<void> {
  return persist(true);
}

"use client";

/**
 * Global audiobook engine. One HTMLAudioElement lives for the whole app session (outside React), so playback
 * survives route changes. The book is modelled as one continuous timeline: chapters carry their global start,
 * the file that holds them and the offset inside that file — this covers single M4B files with embedded
 * chapters and multi-file MP3 books alike.
 *
 * A file is loaded only when playback starts, and at the saved spot through a media fragment (`#t=`): iOS Safari
 * doesn't load media before a user-started play, and a `currentTime` set around that moment can be reported as
 * done and then lost when playback begins. So every jump is a target that counts as reached only once playback
 * has run from there; until then the position isn't taken from the element (or saved), and a jump the app
 * didn't ask for (the element rolling back to 0:00) is undone instead of becoming the new position.
 */
import { create } from "zustand";
import { getChapters, getProgress, journaledPosition, journalPosition, markChaptersComplete, updateProgress } from "../library/repository";
import { recordFinish, recordListen } from "../stats/activity";
import { getFileUrl, revokeFileUrls } from "../storage/blobStore";
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
/** The file whose URL is in the element's src. */
let currentFileId: string | null = null;
/** File time the element still has to reach (see the header comment); null once playback runs from there. */
let target: { time: number; mute: boolean; since: number; lastTry: number; reloaded: boolean } | null = null;
/** Set if this engine failed to open a file with a media fragment; then seeks alone have to do. */
let fragmentsOff = false;
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
  const unlocking = () => a.src === SILENT;
  a.addEventListener("timeupdate", onTime);
  a.addEventListener("play", () => {
    if (unlocking()) return;
    set({ isPlaying: true });
    setPlaybackState("playing");
  });
  a.addEventListener("pause", () => {
    if (unlocking()) return;
    set({ isPlaying: false });
    setPlaybackState("paused");
    void persist(true);
  });
  a.addEventListener("waiting", () => set({ isLoading: true }));
  a.addEventListener("playing", () => {
    set({ isLoading: false });
    nudge(a);
  });
  a.addEventListener("canplay", () => {
    set({ isLoading: false });
    nudge(a);
  });
  a.addEventListener("loadedmetadata", () => nudge(a));
  a.addEventListener("ended", onEnded);
  a.addEventListener("error", () => {
    if (!a.src || unlocking()) return;
    if (!fragmentsOff && a.src.includes("#t=") && currentFileId) {
      // In case this engine can't open a blob URL with a fragment: open the file plainly and seek instead.
      fragmentsOff = true;
      const fileId = currentFileId;
      void getFileUrl(fileId).then((url) => {
        if (!url || currentFileId !== fileId) return;
        a.src = url;
        void startPlayback(a);
      });
      return;
    }
    // The element can't recover from a media error: drop the file (and its URL) so the next play loads it afresh.
    if (currentFileId) revokeFileUrls([currentFileId]);
    currentFileId = null;
    arrived(a);
    set({ error: "Не удалось воспроизвести файл, нажмите ещё раз", isLoading: false, isPlaying: false });
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

/** A media fragment makes the engine start the file there itself — iOS honours it where an early seek gets lost. */
function startUrl(url: string, fileTime: number): string {
  return fileTime > 0.5 && !fragmentsOff ? `${url}#t=${fileTime.toFixed(2)}` : url;
}

/** Make `fileTime` the element's target (see the header comment). `mute` keeps it quiet until it gets there. */
function aim(a: HTMLAudioElement, fileTime: number, opts: { mute?: boolean } = {}): void {
  target = { time: fileTime, mute: !!opts.mute, since: 0, lastTry: 0, reloaded: false };
  if (opts.mute) a.muted = true;
  nudge(a);
}

/** Seek towards the target unless the element is already there (or busy seeking). */
function nudge(a: HTMLAudioElement): void {
  if (!target || a.readyState < 1 || a.seeking) return;
  if (isFinite(a.duration) && a.duration > 0) target.time = Math.min(target.time, Math.max(0, a.duration - 0.25));
  if (Math.abs(a.currentTime - target.time) < 1.5) return;
  target.lastTry = Date.now();
  try {
    a.currentTime = target.time;
  } catch {
    /* not seekable yet: the next event retries */
  }
}

function arrived(a: HTMLAudioElement): void {
  target = null;
  a.muted = false;
}

/** Last resort while playing: load the file again, starting at the target through the media fragment. */
async function reloadAtTarget(a: HTMLAudioElement): Promise<void> {
  const fileId = currentFileId;
  if (!target || !fileId) return;
  target.reloaded = true;
  target.since = Date.now();
  const url = await getFileUrl(fileId);
  if (!url || !target || fileId !== currentFileId) return;
  a.src = startUrl(url, target.time);
  await startPlayback(a);
}

/**
 * Called on timeupdate while playing with a target set. Returns true while the element isn't running from the
 * target yet, so its time must not be shown or saved.
 */
function chasing(a: HTMLAudioElement): boolean {
  if (!target) return false;
  const cur = a.currentTime;
  if (cur > target.time - 1.5 && cur < target.time + 8) {
    a.muted = false;
    if (cur - target.time < 0.4) return true; // there, but wait until playback has actually run from it
    arrived(a);
    return false;
  }
  const now = Date.now();
  if (target.mute) a.muted = true;
  if (!target.since) target.since = now;
  if (target.reloaded && now - target.since > 5000) {
    // The file won't go there: stop rather than carry on (and save) from the wrong place.
    arrived(a);
    a.pause();
    set({ error: "Не получилось перейти к сохранённому месту, нажмите ещё раз" });
  } else if (!target.reloaded && now - target.since > 2000) {
    void reloadAtTarget(a);
  } else if (now - target.lastTry > 700) {
    nudge(a);
  }
  return true;
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
  // Only playback moves the position. A paused element reports seeks we already know about and resets
  // (iOS drops a paused file's media while the app is away) that must not overwrite the saved spot.
  if (a.paused || a.readyState === 0) return;
  if (chasing(a)) return;
  const ch = chapterAtFileTime(currentFileId, a.currentTime);
  if (!ch) return;
  const position = ch.startTime + (a.currentTime - ch.fileStart);
  // Playback never runs backwards: a big step back that the app didn't ask for is the element losing its place
  // (iOS restarting the file), so go back to where the listener was instead of taking it as the new position.
  const known = chapterAtGlobal(s.position);
  if (known && known.fileId === currentFileId && position < s.position - 3) {
    aim(a, known.fileStart + (s.position - known.startTime), { mute: true });
    return;
  }
  // Statistics: playback that ran forward since the last update. Seeks set the position themselves, so they
  // don't count; a step this big can only be a jump.
  const step = position - s.position;
  if (step > 0 && step < 120) recordListen(s.bookId, step / (a.playbackRate || 1), step);

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
  const a = el();
  // The silent unlock clip ends at once: that is not the book's chapter ending (it would start the next one).
  if (a.src === SILENT || !currentFileId) return;
  arrived(a);
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
    recordFinish(s.bookId, "listen");
  }
}

export async function seek(global: number, opts: { autoplay?: boolean } = {}): Promise<void> {
  const s = get();
  if (!s.chapters.length) return;
  const t = Math.max(0, Math.min(global, Math.max(0, s.duration - 0.25)));
  const ch = chapterAtGlobal(t);
  if (!ch) return;
  const a = el();
  const wasPlaying = !a.paused && !a.ended && a.src !== SILENT;
  const autoplay = opts.autoplay ?? wasPlaying;
  const fileTime = ch.fileStart + (t - ch.startTime);
  set({ position: t, chapterIndex: ch.index, error: undefined });
  updateMediaMetadata();
  setPositionState(ch.duration, t - ch.startTime, s.rate);

  if (currentFileId === ch.fileId && a.src && !a.error && a.readyState > 0) {
    // A paused element that has to travel (e.g. reset by iOS while the app was away) stays quiet until it gets there.
    aim(a, fileTime, { mute: a.paused && Math.abs(a.currentTime - fileTime) > 1.5 });
    if (autoplay) await startPlayback(a);
    void persist(true);
    return;
  }

  if (!autoplay) {
    // Paused: just remember the spot; the file is loaded when playback starts.
    void getFileUrl(ch.fileId);
    void persist(true);
    return;
  }
  const token = ++loadToken;
  set({ isLoading: true });
  const url = await getFileUrl(ch.fileId);
  if (token !== loadToken) return;
  if (!url) {
    set({ error: "Файл аудиокниги не найден на устройстве", isLoading: false });
    return;
  }
  currentFileId = ch.fileId;
  a.defaultPlaybackRate = s.rate;
  a.src = startUrl(url, fileTime);
  a.playbackRate = s.rate;
  aim(a, fileTime, { mute: fileTime > 0.5 });
  await startPlayback(a);
  void persist(true);
}

async function startPlayback(a: HTMLAudioElement): Promise<void> {
  try {
    await a.play();
  } catch {
    a.muted = false;
    set({ isPlaying: false, isLoading: false });
  }
}

/** The book was renamed (or its cover redrawn): show the new names and cover in the player and on the lock screen. */
export async function refreshPlayerInfo(bookId: string): Promise<void> {
  if (get().bookId !== bookId) return;
  const [book, rows] = await Promise.all([getDB().books.get(bookId), getChapters(bookId)]);
  if (!book || get().bookId !== bookId) return;
  const cover = book.coverFileId ? (await getFileUrl(book.coverFileId)) ?? book.coverUrl : book.coverUrl;
  const titles = new Map(rows.map((r) => [r.index, r.title]));
  set({
    title: book.title,
    author: book.author,
    narrator: book.narrator,
    cover,
    artwork: book.coverUrl,
    chapters: get().chapters.map((c) => ({ ...c, title: titles.get(c.index) ?? c.title })),
  });
  updateMediaMetadata();
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
    arrived(a);
    set({
      bookId,
      title: book.title,
      author: book.author,
      narrator: book.narrator,
      cover,
      artwork: book.coverUrl,
      chapters,
      duration: book.duration ?? chapters.reduce((m, c) => Math.max(m, c.startTime + c.duration), 0),
      position: journaledPosition(bookId, progress)?.audioTimestamp ?? progress.audioTimestamp,
      chapterIndex: journaledPosition(bookId, progress)?.currentChapterIndex ?? progress.currentChapterIndex,
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
  if (!s.bookId || !s.chapters.length) return;
  const start = s.position >= s.duration - 1 ? 0 : s.position;
  const ch = chapterAtGlobal(start);
  const expected = ch ? ch.fileStart + (start - ch.startTime) : 0;
  // The element lost its place (iOS drops a paused file's media while the app is away): load it again at the spot.
  if (!target && currentFileId && Math.abs(a.currentTime - expected) > 1.5) currentFileId = null;
  if (!ch || currentFileId !== ch.fileId || !a.src || a.src === SILENT || a.error) {
    await seek(start, { autoplay: true });
    return;
  }
  await startPlayback(a);
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
  arrived(a);
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

/** Save right away (the app is being hidden); the journal copy survives even if the database write is cut off. */
export function persistNow(): Promise<void> {
  const s = get();
  if (s.bookId && s.chapters.length) {
    journalPosition(s.bookId, { audioTimestamp: s.position, currentChapterIndex: s.chapterIndex, percentage: s.duration ? (s.position / s.duration) * 100 : 0 });
  }
  return persist(true);
}

/**
 * The native book player of the iOS and Android apps (native/boowie-player). It plays the book's files as one
 * timeline in seconds and keeps going with the screen locked: moving on to the next file, the lock screen and the
 * notification, the sleep timer and the saved place are all on the native side, so they work while the WebView is
 * asleep. player.ts drives it and mirrors its "state" events into the player store.
 */
import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface NativeTrack {
  /** file:// URI of the audio file in the app's files. */
  path: string;
  /** Seconds. The tracks follow each other on the book's timeline. */
  duration: number;
}

export interface NativeState {
  /** Absent when no book is in the player. */
  bookId?: string;
  /** When the book was put into the player; the played counters count from then. */
  session: number;
  /** The book's files are in the player (it can play without loading them first). */
  loaded: boolean;
  /** Seconds on the book's timeline. */
  position: number;
  index: number;
  duration: number;
  playing: boolean;
  buffering: boolean;
  ended: boolean;
  rate: number;
  /** Seconds of playing by the clock and seconds of the book played, since `session`. */
  playedWall: number;
  playedMedia: number;
  error?: string;
  /** The sleep timer has just paused the book. */
  sleepFired?: boolean;
}

export interface NativeLastSession {
  bookId?: string;
  position?: number;
  /** ms since 1970 */
  updatedAt?: number;
}

export interface BoowiePlayerPlugin {
  loadBook(options: {
    bookId: string;
    tracks: NativeTrack[];
    chapters: { start: number; title: string }[];
    position: number;
    rate: number;
    title: string;
    author: string;
    /** file:// URI of the cover for the lock screen. */
    artwork?: string;
    autoplay: boolean;
  }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { position: number }): Promise<void>;
  setRate(options: { rate: number }): Promise<void>;
  /** Pause at a time (ms since 1970, the last 10 s fade out) or at a point of the book; neither clears the timer. */
  setSleep(options: { at?: number; position?: number }): Promise<void>;
  unload(): Promise<void>;
  getState(): Promise<NativeState>;
  lastSession(): Promise<NativeLastSession>;
  addListener(event: "state", listener: (state: NativeState) => void): Promise<PluginListenerHandle>;
}

export const BoowiePlayer = registerPlugin<BoowiePlayerPlugin>("BoowiePlayer");

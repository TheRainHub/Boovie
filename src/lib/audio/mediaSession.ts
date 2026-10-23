/**
 * Lock screen / Control Center / AirPods / Android notification integration via the Media Session API.
 */

export interface MediaHandlers {
  play: () => void;
  pause: () => void;
  stop: () => void;
  seekBy: (delta: number) => void;
  /** Seek within the current chapter (the lock-screen scrubber is chapter-relative). */
  seekToInChapter: (seconds: number) => void;
  previousChapter: () => void;
  nextChapter: () => void;
}

export const SKIP_BACK = 15;
export const SKIP_FORWARD = 30;

const supported = () => typeof navigator !== "undefined" && "mediaSession" in navigator;

export function installMediaHandlers(h: MediaHandlers): void {
  if (!supported()) return;
  const ms = navigator.mediaSession;
  const set = (action: MediaSessionAction, fn: MediaSessionActionHandler | null) => {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      /* action not supported on this platform */
    }
  };
  set("play", () => h.play());
  set("pause", () => h.pause());
  set("stop", () => h.stop());
  set("seekbackward", (d) => h.seekBy(-(d.seekOffset ?? SKIP_BACK)));
  set("seekforward", (d) => h.seekBy(d.seekOffset ?? SKIP_FORWARD));
  set("seekto", (d) => d.seekTime !== undefined && h.seekToInChapter(d.seekTime));
  set("previoustrack", () => h.previousChapter());
  set("nexttrack", () => h.nextChapter());
}

export function setMediaMetadata(meta: { title: string; artist: string; album: string; artwork?: string }): void {
  if (!supported() || typeof MediaMetadata === "undefined") return;
  const artwork = meta.artwork
    ? [96, 192, 256, 512].map((s) => ({ src: meta.artwork!, sizes: `${s}x${s}`, type: meta.artwork!.endsWith(".png") ? "image/png" : "image/jpeg" }))
    : [];
  navigator.mediaSession.metadata = new MediaMetadata({ title: meta.title, artist: meta.artist, album: meta.album, artwork });
}

export function setPlaybackState(state: MediaSessionPlaybackState): void {
  if (supported()) navigator.mediaSession.playbackState = state;
}

export function setPositionState(duration: number, position: number, playbackRate: number): void {
  if (!supported() || !navigator.mediaSession.setPositionState) return;
  if (!isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({ duration, playbackRate, position: Math.min(Math.max(0, position), duration) });
  } catch {
    /* invalid state during source switches */
  }
}

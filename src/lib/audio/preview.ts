"use client";

/** Store sample previews ("Слушать фрагмент"): streams the first 90 s of a catalog file without downloading it. */
import { create } from "zustand";
import { pause as pauseMain, usePlayer } from "./player";

export const PREVIEW_SECONDS = 90;

interface PreviewState {
  itemId: string | null;
  playing: boolean;
  loading: boolean;
  progress: number; // 0..1 of PREVIEW_SECONDS
}

export const usePreview = create<PreviewState>(() => ({ itemId: null, playing: false, loading: false, progress: 0 }));

let el: HTMLAudioElement | null = null;

function audio(): HTMLAudioElement {
  if (el) return el;
  el = new Audio();
  el.preload = "none";
  el.addEventListener("timeupdate", () => {
    const p = el!.currentTime / PREVIEW_SECONDS;
    usePreview.setState({ progress: Math.min(1, p) });
    if (p >= 1) stopPreview();
  });
  el.addEventListener("playing", () => usePreview.setState({ playing: true, loading: false }));
  el.addEventListener("pause", () => usePreview.setState({ playing: false }));
  el.addEventListener("ended", () => stopPreview());
  el.addEventListener("error", () => usePreview.setState({ playing: false, loading: false }));
  return el;
}

export function togglePreview(itemId: string, url: string): void {
  const a = audio();
  const s = usePreview.getState();
  if (s.itemId === itemId && s.playing) {
    a.pause();
    return;
  }
  if (usePlayer.getState().isPlaying) pauseMain();
  if (s.itemId !== itemId) {
    a.src = url;
    usePreview.setState({ itemId, progress: 0, loading: true });
  }
  void a.play().catch(() => usePreview.setState({ loading: false, playing: false }));
}

export function stopPreview(): void {
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  usePreview.setState({ itemId: null, playing: false, loading: false, progress: 0 });
}

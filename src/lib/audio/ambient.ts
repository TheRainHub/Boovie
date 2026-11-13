"use client";

/**
 * Playing the sounds for reading (see ambientSynth.ts) while a book is open: one sound at a time, looped, faded in
 * and out, at its own volume. The choice and the volume are remembered on the device; a book opened later picks
 * the sound up again at the first touch (a browser starts sound only on a touch).
 */
import { create } from "zustand";
import { RATE, renderAmbient, type AmbientId } from "./ambientSynth";

export type { AmbientId } from "./ambientSynth";

interface AmbientState {
  /** The chosen sound (also while paused by leaving the book), or none. */
  id: AmbientId | null;
  volume: number;
  /** The sound being made right now. */
  loading: AmbientId | null;
  playing: boolean;
}

const KEY = "boowie-ambient";

function stored(): Pick<AmbientState, "id" | "volume"> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Pick<AmbientState, "id" | "volume"> | null;
    if (v) return { id: v.id ?? null, volume: typeof v.volume === "number" ? v.volume : 0.6 };
  } catch {
    /* no storage */
  }
  return { id: null, volume: 0.6 };
}

export const useAmbient = create<AmbientState>(() => ({ id: null, volume: 0.6, loading: null, playing: false }));
let loaded = false;
/** The remembered choice, read once on the client. */
function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  useAmbient.setState(stored());
}
function persist() {
  const { id, volume } = useAmbient.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, volume }));
  } catch {
    /* private mode */
  }
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: { id: AmbientId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
const buffers = new Map<AmbientId, Promise<AudioBuffer>>();
let request = 0;

/** Safari's audio session: «playback» lets the sound play with the ringer switch off. */
function audioSession(type: "playback" | "auto") {
  const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (s) {
    try {
      s.type = type;
    } catch {
      /* unsupported type */
    }
  }
}

function context(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "playback" });
    master = ctx.createGain();
    master.gain.value = curve(useAmbient.getState().volume);
    master.connect(ctx.destination);
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.visibilityState === "hidden") void ctx.suspend();
      else if (current) void ctx.resume();
    });
  }
  return ctx;
}

/** Loudness follows the slider the way the ear hears it. */
const curve = (v: number) => v * v;

function buffer(id: AmbientId): Promise<AudioBuffer> {
  let b = buffers.get(id);
  if (!b) {
    b = renderAmbient(id).then(([L, R]) => {
      const buf = context().createBuffer(2, L.length, RATE);
      buf.copyToChannel(L as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(R as Float32Array<ArrayBuffer>, 1);
      return buf;
    });
    b.catch(() => buffers.delete(id));
    buffers.set(id, b);
    // Keep the last few sounds made.
    if (buffers.size > 3) buffers.delete(buffers.keys().next().value!);
  }
  return b;
}

let sleep: ReturnType<typeof setTimeout> | undefined;

function fadeOut(seconds: number) {
  if (!current || !ctx) return;
  const { src, gain } = current;
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(gain.gain.value, t);
  gain.gain.linearRampToValueAtTime(0, t + seconds);
  src.stop(t + seconds + 0.05);
  current = null;
}

/** Nothing playing: the audio context sleeps (it holds the device's audio otherwise). */
function sleepSoon() {
  clearTimeout(sleep);
  sleep = setTimeout(() => {
    if (!current && ctx && ctx.state === "running") void ctx.suspend();
  }, 1500);
}

/** Play a sound (in place of the one playing). Must start from a touch or a key press. */
export async function playAmbient(id: AmbientId): Promise<void> {
  ensureLoaded();
  const ac = context();
  const mine = ++request;
  useAmbient.setState({ id, loading: id });
  persist();
  clearTimeout(sleep);
  void ac.resume();
  audioSession("playback");
  let buf: AudioBuffer;
  try {
    buf = await buffer(id);
  } catch {
    if (mine === request) useAmbient.setState({ loading: null });
    return;
  }
  // Another sound was chosen meanwhile, or the book was closed.
  if (mine !== request) return;
  fadeOut(1.2);
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(1, ac.currentTime + 1.8);
  src.connect(gain).connect(master!);
  // Start somewhere in the loop, so the same moment doesn't greet every opening.
  src.start(0, Math.random() * buf.duration);
  current = { id, src, gain };
  useAmbient.setState({ loading: null, playing: true });
}

/** Silence: the sound stops and is no longer chosen. */
export function stopAmbient(): void {
  ensureLoaded();
  request++;
  fadeOut(0.7);
  sleepSoon();
  useAmbient.setState({ id: null, loading: null, playing: false });
  persist();
  audioSession("auto");
}

/** The book was closed: the sound stops, the choice stays for the next book. */
export function pauseAmbient(): void {
  request++;
  fadeOut(0.5);
  sleepSoon();
  useAmbient.setState({ loading: null, playing: false });
  audioSession("auto");
}

export function setAmbientVolume(volume: number): void {
  ensureLoaded();
  useAmbient.setState({ volume });
  persist();
  if (ctx && master) master.gain.setTargetAtTime(curve(volume), ctx.currentTime, 0.05);
}

/** In an open book: the remembered sound comes back at the first touch, and stops when the book is closed. */
export function attachAmbient(): () => void {
  ensureLoaded();
  const start = () => {
    off();
    const { id, playing, loading } = useAmbient.getState();
    if (id && !playing && !loading) void playAmbient(id);
  };
  const off = () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
  };
  if (useAmbient.getState().id) {
    window.addEventListener("pointerdown", start, true);
    window.addEventListener("keydown", start, true);
  }
  return () => {
    off();
    pauseAmbient();
  };
}

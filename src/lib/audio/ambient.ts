"use client";

/**
 * Playing the sounds for reading (see ambientSynth.ts) while a book is open, as a mixer: every sound has a level of
 * its own (0 is off), so rain can go with the fireplace. Every book starts in silence; closing it stops the sounds.
 *
 * To keep the sliders quick, the sounds are made in a worker as soon as the sounds' sheet opens, and a drag only
 * moves the sound's gain (the store is told when the drag ends).
 */
import { create } from "zustand";
import { withBase } from "../basePath";
import { RATE, renderAmbient, type AmbientId } from "./ambientSynth";

export type { AmbientId } from "./ambientSynth";

export const AMBIENT_IDS: AmbientId[] = ["rain", "storm", "fire", "sea", "forest", "night", "train"];

type Levels = Partial<Record<AmbientId, number>>;

interface AmbientState {
  /** Each sound's level, 0..1 (absent or 0: off), as of the last finished drag. */
  levels: Levels;
}

export const useAmbient = create<AmbientState>(() => ({ levels: {} }));

/** The sounds that are on. */
export function activeSounds(levels: Levels): AmbientId[] {
  return AMBIENT_IDS.filter((id) => (levels[id] ?? 0) > 0);
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const voices = new Map<AmbientId, { src: AudioBufferSourceNode; gain: GainNode }>();
const starting = new Set<AmbientId>();
const buffers = new Map<AmbientId, Promise<AudioBuffer>>();
/** Where each slider is right now (it runs ahead of the store during a drag). */
const live: Levels = {};
/** Bumped when the book is closed: sounds still being made then don't start. */
let epoch = 0;
let sleep: ReturnType<typeof setTimeout> | undefined;

/** Safari's audio session: «playback» lets the sounds play with the ringer switch off. */
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

/** The app's audio context (shared with the page sounds); created on first use. */
export function audioContext(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "interactive" });
    // Several sounds together must not clip: a gentle limiter after the mix.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 8;
    limiter.ratio.value = 10;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.3;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(limiter).connect(ctx.destination);
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.visibilityState === "hidden") void ctx.suspend();
      else if (voices.size) void ctx.resume();
    });
  }
  return ctx;
}

/** A touch: the audio context may start now (browsers allow it only then). */
export function unlockAudio(): AudioContext {
  const ac = audioContext();
  clearTimeout(sleep);
  if (ac.state !== "running") void ac.resume();
  return ac;
}

/**
 * Let the audio context sleep when nothing plays (it holds the device's audio otherwise) — after a while, so page
 * sounds while reading don't wake it every time.
 */
export function audioIdle(): void {
  clearTimeout(sleep);
  sleep = setTimeout(() => {
    if (!voices.size && ctx && ctx.state === "running") void ctx.suspend();
  }, 15_000);
}

/* ── making the sounds: in a worker, or on the page where there is none ─────────────────── */
let worker: Worker | null | undefined;
const waiting = new Map<AmbientId, { resolve: (v: [Float32Array, Float32Array]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    // A plain same-origin script, bundled by scripts/build-workers.mjs.
    worker = new Worker(withBase("/ambient-worker.js"));
    worker.onmessage = (e: MessageEvent<{ id: AmbientId; L?: Float32Array; R?: Float32Array; error?: string }>) => {
      const { id, L, R, error } = e.data;
      const w = waiting.get(id);
      waiting.delete(id);
      if (!w) return;
      if (L && R) w.resolve([L, R]);
      else w.reject(new Error(error ?? "render"));
    };
    worker.onerror = () => {
      // The worker can't run here: make what is waiting on the page.
      worker?.terminate();
      worker = null;
      const pending = [...waiting];
      waiting.clear();
      for (const [id, w] of pending) renderAmbient(id).then(w.resolve, w.reject);
    };
  } catch {
    worker = null;
  }
  return worker;
}

function samples(id: AmbientId): Promise<[Float32Array, Float32Array]> {
  const w = getWorker();
  if (!w) return renderAmbient(id);
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage({ id });
  });
}

function buffer(id: AmbientId): Promise<AudioBuffer> {
  let b = buffers.get(id);
  if (!b) {
    b = samples(id).then(([L, R]) => {
      const buf = audioContext().createBuffer(2, L.length, RATE);
      buf.copyToChannel(L as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(R as Float32Array<ArrayBuffer>, 1);
      return buf;
    });
    b.catch(() => buffers.delete(id));
    buffers.set(id, b);
  }
  return b;
}

/** Make every sound ahead, so a slider brings its sound in at once. */
export function prepareAmbient(): void {
  for (const id of AMBIENT_IDS) void buffer(id).catch(() => undefined);
}

/** Loudness follows the slider the way the ear hears it. */
const curve = (v: number) => v * v;

async function startVoice(id: AmbientId) {
  if (voices.has(id) || starting.has(id)) return;
  starting.add(id);
  const mine = epoch;
  const ac = unlockAudio();
  audioSession("playback");
  let buf: AudioBuffer;
  try {
    buf = await buffer(id);
  } catch {
    starting.delete(id);
    return;
  }
  starting.delete(id);
  const level = live[id] ?? 0;
  // The book was closed meanwhile, or the slider went back to nothing.
  if (mine !== epoch || level <= 0 || voices.has(id)) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.setTargetAtTime(curve(level), ac.currentTime, 0.05);
  src.connect(gain).connect(master!);
  // Start somewhere in the loop, so the same moment doesn't greet every opening.
  src.start(0, Math.random() * buf.duration);
  voices.set(id, { src, gain });
}

function stopVoice(id: AmbientId, seconds = 0.25) {
  const v = voices.get(id);
  if (!v || !ctx) return;
  voices.delete(id);
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0, t + seconds);
  v.src.stop(t + seconds + 0.05);
  if (!voices.size) {
    audioIdle();
    audioSession("auto");
  }
}

/** While a slider moves: the sound follows at once (the store isn't touched). */
export function setLevelLive(id: AmbientId, level: number): void {
  const v = Math.max(0, Math.min(1, level));
  live[id] = v;
  if (v <= 0) {
    stopVoice(id);
    return;
  }
  const voice = voices.get(id);
  if (voice && ctx) voice.gain.gain.setTargetAtTime(curve(v), ctx.currentTime, 0.03);
  else void startVoice(id);
}

/** A slider came to rest (or a key moved it): the level as it now stands. */
export function setAmbientLevel(id: AmbientId, level: number): void {
  const v = Math.max(0, Math.min(1, level));
  setLevelLive(id, v);
  useAmbient.setState((s) => ({ levels: { ...s.levels, [id]: v } }));
}

/** In an open book: silence to begin with; closing the book stops the sounds and lets their samples go. */
export function attachAmbient(): () => void {
  return () => {
    epoch++;
    for (const id of [...voices.keys()]) stopVoice(id, 0.5);
    for (const id of AMBIENT_IDS) delete live[id];
    buffers.clear();
    useAmbient.setState({ levels: {} });
  };
}

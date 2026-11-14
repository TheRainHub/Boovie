"use client";

/**
 * Playing the sounds for reading (see ambientSynth.ts) while a book is open, as a mixer: every sound has a level of
 * its own (0 is off), so rain can go with the fireplace. Each plays as a loop through its own gain, faded in and
 * out. The levels are remembered on the device; a book opened later brings them back at the first touch (a
 * browser starts sound only on a touch), and closing the book stops them.
 */
import { create } from "zustand";
import { RATE, renderAmbient, type AmbientId } from "./ambientSynth";

export type { AmbientId } from "./ambientSynth";

export const AMBIENT_IDS: AmbientId[] = ["rain", "storm", "fire", "sea", "forest", "night", "train"];

type Levels = Partial<Record<AmbientId, number>>;

interface AmbientState {
  /** Each sound's level, 0..1 (absent or 0: off). Kept while the book is closed. */
  levels: Levels;
  /** The level a sound had before it was switched off, for switching it on again. */
  memory: Levels;
  /** Sounds being made right now. */
  loading: AmbientId[];
  /** The sounds are playing (a book is open and was touched). */
  playing: boolean;
}

const KEY = "boowie-ambient";
const DEFAULT_LEVEL = 0.5;

export const useAmbient = create<AmbientState>(() => ({ levels: {}, memory: {}, loading: [], playing: false }));

let loaded = false;
/** The remembered levels, read once on the client (also from the one-sound version: `{ id, volume }`). */
function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as { levels?: Levels; memory?: Levels; id?: AmbientId | null; volume?: number } | null;
    if (!v) return;
    if (v.levels) useAmbient.setState({ levels: v.levels, memory: v.memory ?? {} });
    else if (v.id) useAmbient.setState({ levels: { [v.id]: v.volume ?? DEFAULT_LEVEL } });
  } catch {
    /* no storage */
  }
}
function persist() {
  const { levels, memory } = useAmbient.getState();
  try {
    localStorage.setItem(KEY, JSON.stringify({ levels, memory }));
  } catch {
    /* private mode */
  }
}

/** The sounds that are on. */
export function activeSounds(levels: Levels): AmbientId[] {
  return AMBIENT_IDS.filter((id) => (levels[id] ?? 0) > 0);
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const voices = new Map<AmbientId, { src: AudioBufferSourceNode; gain: GainNode }>();
const buffers = new Map<AmbientId, Promise<AudioBuffer>>();
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

function context(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC({ latencyHint: "playback" });
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
  }
  return b;
}

/** Let the audio context sleep when nothing plays (it holds the device's audio otherwise). */
function sleepSoon() {
  clearTimeout(sleep);
  sleep = setTimeout(() => {
    if (!voices.size && ctx && ctx.state === "running") void ctx.suspend();
  }, 1500);
}

/** A touch: the audio context may start now (browsers allow it only then). */
export function unlockAmbient(): void {
  ensureLoaded();
  const ac = context();
  clearTimeout(sleep);
  if (ac.state !== "running") void ac.resume();
}

async function startVoice(id: AmbientId) {
  if (voices.has(id)) return;
  const ac = context();
  const mine = epoch;
  clearTimeout(sleep);
  void ac.resume();
  audioSession("playback");
  useAmbient.setState((s) => ({ loading: [...new Set([...s.loading, id])] }));
  let buf: AudioBuffer;
  try {
    buf = await buffer(id);
  } catch {
    useAmbient.setState((s) => ({ loading: s.loading.filter((x) => x !== id) }));
    return;
  }
  useAmbient.setState((s) => ({ loading: s.loading.filter((x) => x !== id) }));
  const level = useAmbient.getState().levels[id] ?? 0;
  // Closed meanwhile, switched off meanwhile, or already started by another call.
  if (mine !== epoch || level <= 0 || voices.has(id) || !useAmbient.getState().playing) return;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, ac.currentTime);
  gain.gain.linearRampToValueAtTime(curve(level), ac.currentTime + 1.6);
  src.connect(gain).connect(master!);
  // Start somewhere in the loop, so the same moment doesn't greet every opening.
  src.start(0, Math.random() * buf.duration);
  voices.set(id, { src, gain });
}

function stopVoice(id: AmbientId, seconds = 0.6) {
  const v = voices.get(id);
  if (!v || !ctx) return;
  voices.delete(id);
  const t = ctx.currentTime;
  v.gain.gain.cancelScheduledValues(t);
  v.gain.gain.setValueAtTime(v.gain.gain.value, t);
  v.gain.gain.linearRampToValueAtTime(0, t + seconds);
  v.src.stop(t + seconds + 0.05);
  if (!voices.size) {
    sleepSoon();
    audioSession("auto");
  }
}

/** Set a sound's level (0 switches it off). Starting a sound must come from a touch or a key press. */
export function setAmbientLevel(id: AmbientId, level: number): void {
  ensureLoaded();
  const v = Math.max(0, Math.min(1, level));
  const s = useAmbient.getState();
  useAmbient.setState({
    levels: { ...s.levels, [id]: v },
    memory: v > 0 ? { ...s.memory, [id]: v } : s.memory,
    playing: v > 0 ? true : s.playing,
  });
  persist();
  if (v <= 0) {
    stopVoice(id);
    return;
  }
  const voice = voices.get(id);
  if (voice && ctx) voice.gain.gain.setTargetAtTime(curve(v), ctx.currentTime, 0.04);
  else void startVoice(id);
}

/** Switch a sound on (at its last level) or off. */
export function toggleAmbient(id: AmbientId): void {
  ensureLoaded();
  const { levels, memory } = useAmbient.getState();
  if ((levels[id] ?? 0) > 0) setAmbientLevel(id, 0);
  else setAmbientLevel(id, memory[id] && memory[id]! > 0.04 ? memory[id]! : DEFAULT_LEVEL);
}

/** Silence: every sound off (their levels are remembered for switching them on again). */
export function stopAmbient(): void {
  ensureLoaded();
  for (const id of [...voices.keys()]) stopVoice(id, 0.7);
  const { levels, memory } = useAmbient.getState();
  const kept = { ...memory };
  for (const id of activeSounds(levels)) kept[id] = levels[id];
  useAmbient.setState({ levels: {}, memory: kept });
  persist();
}

/** The book was closed: the sounds stop, their levels stay for the next book. */
export function pauseAmbient(): void {
  epoch++;
  for (const id of [...voices.keys()]) stopVoice(id, 0.5);
  useAmbient.setState({ playing: false, loading: [] });
}

/** In an open book: the remembered sounds come back at the first touch, and stop when the book is closed. */
export function attachAmbient(): () => void {
  ensureLoaded();
  const start = () => {
    off();
    const { levels } = useAmbient.getState();
    const on = activeSounds(levels);
    if (!on.length) return;
    unlockAmbient();
    useAmbient.setState({ playing: true });
    for (const id of on) void startVoice(id);
  };
  const off = () => {
    window.removeEventListener("pointerdown", start, true);
    window.removeEventListener("keydown", start, true);
  };
  if (activeSounds(useAmbient.getState().levels).length) {
    window.addEventListener("pointerdown", start, true);
    window.addEventListener("keydown", start, true);
  }
  return () => {
    off();
    pauseAmbient();
  };
}

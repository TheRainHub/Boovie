"use client";

/**
 * The colour of a cover, and the colours of a screen tinted by it (home, player, the «continue» card).
 *
 * The dominant hue comes from the saturated pixels, so a dark cover with a red title still reads red. Covers
 * that are practically grey fall back to a warm brown, so a tinted screen never turns cold grey.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useFileUrl } from "../library/hooks";

/** h, s, l in 0..1; `grey` when the cover has no usable colour. */
export interface Tone {
  h: number;
  s: number;
  l: number;
  grey?: boolean;
}

/** Terracotta-brown: the app's own colour, used for grey covers and screens without a book. */
const FALLBACK: Tone = { h: 22 / 360, s: 0.42, l: 0.4 };

function toHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

/** Dominant colour of RGBA pixels: a weighted hue histogram, then the mean of the winning neighbourhood. */
export function dominantTone(data: Uint8ClampedArray): Tone {
  const BINS = 24;
  const weight = new Float64Array(BINS);
  const px: [number, number, number, number][] = [];
  let lSum = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const [h, s, l] = toHsl(data[i], data[i + 1], data[i + 2]);
    lSum += l;
    n++;
    // Favour saturated mid-tones; near-black, near-white and grey pixels say little about the cover's colour.
    const w = s * s * Math.max(0, 1 - Math.abs(l - 0.5) * 1.6);
    if (w <= 0.004) continue;
    const bin = Math.floor(h * BINS) % BINS;
    weight[bin] += w;
    px.push([h, s, l, w]);
  }
  const meanL = n ? lSum / n : 0.5;
  let best = 0;
  for (let b = 1; b < BINS; b++) if (weight[b] + weight[(b + 1) % BINS] + weight[(b + BINS - 1) % BINS] > weight[best] + weight[(best + 1) % BINS] + weight[(best + BINS - 1) % BINS]) best = b;
  const total = weight.reduce((a, b) => a + b, 0);
  if (!n || total / n < 0.012) return { h: 0, s: 0, l: meanL, grey: true };

  let x = 0, y = 0, s = 0, l = 0, w = 0;
  for (const [ph, ps, pl, pw] of px) {
    const bin = Math.floor(ph * BINS) % BINS;
    const dist = Math.min(Math.abs(bin - best), BINS - Math.abs(bin - best));
    if (dist > 1) continue;
    x += Math.cos(ph * 2 * Math.PI) * pw;
    y += Math.sin(ph * 2 * Math.PI) * pw;
    s += ps * pw;
    l += pl * pw;
    w += pw;
  }
  const h = ((Math.atan2(y, x) / (2 * Math.PI)) + 1) % 1;
  return { h, s: s / w, l: (l / w) * 0.5 + meanL * 0.5 };
}

/* ── extraction with a two-level cache (memory + localStorage, keyed by file id / URL) ──────── */
const STORE_KEY = "titan-tones";
const memory = new Map<string, Promise<Tone | null>>();
let persisted: Record<string, Tone> | null = null;

function persistedTones(): Record<string, Tone> {
  if (persisted) return persisted;
  try {
    persisted = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Record<string, Tone>;
  } catch {
    persisted = {};
  }
  return persisted!;
}

function remember(key: string, tone: Tone) {
  const all = persistedTones();
  all[key] = tone;
  const keys = Object.keys(all);
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete all[k];
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* quota / private mode */
  }
}

async function measure(src: string): Promise<Tone | null> {
  const img = new Image();
  img.decoding = "async";
  if (!src.startsWith("blob:") && !src.startsWith("data:")) img.crossOrigin = "anonymous";
  img.src = src;
  try {
    await img.decode();
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, 32, 32);
  try {
    return dominantTone(ctx.getImageData(0, 0, 32, 32).data);
  } catch {
    return null; // tainted by a cross-origin image without CORS
  }
}

export function coverTone(key: string, src: string): Promise<Tone | null> {
  const known = persistedTones()[key];
  if (known) return Promise.resolve(known);
  let job = memory.get(key);
  if (!job) {
    job = measure(src).then((t) => {
      if (t) remember(key, t);
      return t;
    });
    memory.set(key, job);
  }
  return job;
}

/** Tone of a book's cover; `null` while unknown or when there is no cover. */
export function useCoverTone(fileId?: string, url?: string): Tone | null {
  const src = useFileUrl(fileId, url);
  const key = fileId ?? url;
  // Starts empty on purpose: the static export prerenders without storage, and the first client render must match.
  const [state, setState] = useState<{ key?: string; tone: Tone | null }>({ tone: null });
  useEffect(() => {
    if (!key || !src) return;
    let alive = true;
    void coverTone(key, src).then((tone) => alive && setState({ key, tone }));
    return () => {
      alive = false;
    };
  }, [key, src]);
  return state.key === key ? state.tone : null;
}

/* ── tinted surfaces ─────────────────────────────────────────────────────────────────────── */
const hsl = (h: number, s: number, l: number) =>
  `hsl(${(h * 360).toFixed(1)} ${(Math.min(1, Math.max(0, s)) * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

/**
 * CSS custom properties for a screen or card tinted by a cover (consumed by the `t-*` colour utilities):
 * a deep, saturated gradient of the cover's hue with warm white text, the same in both themes.
 */
export function toneVars(tone: Tone | null, kind: "screen" | "card" = "screen"): CSSProperties {
  const { h, s } = !tone || tone.grey ? FALLBACK : tone;
  const S = Math.max(s, 0.34);
  return {
    "--t-bg": kind === "screen"
      ? `linear-gradient(180deg, ${hsl(h, S, 0.33)} 0%, ${hsl(h, S * 0.92, 0.19)} 46%, ${hsl(h, S * 0.7, 0.075)} 100%)`
      : `linear-gradient(135deg, ${hsl(h, S, 0.36)}, ${hsl(h, S * 0.9, 0.22)})`,
    "--t-solid": hsl(h, S, 0.2),
    "--t-ink": "#fffaf3",
    "--t-ink-2": "rgb(255 250 243 / 0.64)",
    "--t-btn": "#fffaf3",
    "--t-btn-ink": hsl(h, S, 0.16),
    "--t-chip": "rgb(255 250 243 / 0.14)",
    "--t-track": "rgb(255 250 243 / 0.22)",
    "--t-shadow": "rgb(0 0 0 / 0.7)",
  } as CSSProperties;
}

/** Everything a tinted element needs for a given cover. */
export function useToned(fileId?: string, url?: string, kind: "screen" | "card" = "screen"): { style: CSSProperties; tone: Tone | null } {
  const tone = useCoverTone(fileId, url);
  return { style: toneVars(tone, kind), tone };
}

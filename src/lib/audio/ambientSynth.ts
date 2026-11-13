/**
 * Sounds for reading, made on the device: rain, a storm, a fireplace, the sea, a forest, a summer night and a train.
 * Each is a loop of filtered noise and small events (drops, crackles, birds, wheels) rendered into a buffer, its
 * end cross-faded into its start so it goes round without a seam. No files, no network, nothing to license.
 *
 * Rendering runs in slices with pauses between them, so the screen stays responsive while a sound is made.
 */

export type AmbientId = "rain" | "storm" | "fire" | "sea" | "forest" | "night" | "train";

export const RATE = 32000;
const XFADE = 2;

/** Seconded random numbers (mulberry32): the same sound every time. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An RBJ biquad: low-pass, high-pass or band-pass. */
class Biquad {
  private b0 = 0; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(kind: "lp" | "hp" | "bp", freq: number, q = 0.707) {
    this.set(kind, freq, q);
  }
  set(kind: "lp" | "hp" | "bp", freq: number, q = 0.707) {
    const w = (2 * Math.PI * Math.min(freq, RATE * 0.45)) / RATE;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    if (kind === "lp") {
      this.b0 = (1 - cos) / 2 / a0; this.b1 = (1 - cos) / a0; this.b2 = this.b0;
    } else if (kind === "hp") {
      this.b0 = (1 + cos) / 2 / a0; this.b1 = -(1 + cos) / a0; this.b2 = this.b0;
    } else {
      this.b0 = alpha / a0; this.b1 = 0; this.b2 = -alpha / a0;
    }
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  step(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** A one-pole low-pass whose corner can move every sample. */
class Smooth {
  y = 0;
  step(x: number, a: number): number {
    return (this.y += a * (x - this.y));
  }
}
const coef = (freq: number) => 1 - Math.exp((-2 * Math.PI * freq) / RATE);

/** Pink noise (Paul Kellet's filter), roughly ±1. */
class Pink {
  private b0 = 0; private b1 = 0; private b2 = 0;
  constructor(private rnd: () => number) {}
  step(): number {
    const w = this.rnd() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848179) * 0.22;
  }
}

/** Brown (red) noise, roughly ±1. */
class Brown {
  private b = 0;
  constructor(private rnd: () => number) {}
  step(): number {
    this.b = (this.b + 0.02 * (this.rnd() * 2 - 1)) / 1.02;
    return this.b * 3.5;
  }
}

/** A slow random wobble between 0 and 1 (for gusts, flicker, swell). */
class Wobble {
  private s = new Smooth();
  private target = 0.5;
  private left = 0;
  constructor(private rnd: () => number, private seconds: number) {}
  step(): number {
    if (--this.left <= 0) {
      this.target = this.rnd();
      this.left = Math.round(this.seconds * RATE * (0.5 + this.rnd()));
    }
    return this.s.step(this.target, 1 / (this.seconds * RATE * 0.5));
  }
}

const pan = (p: number): [number, number] => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

/** A sound: fills sample ranges of both channels in order. */
type Voice = (L: Float32Array, R: Float32Array, from: number, to: number) => void;

/** Impulses through a bank of resonant filters: drops on leaves, crackles of a fire. */
function sparkles(rnd: () => number, opts: { rate: (t: number) => number; freqs: number[]; q: number; amp: () => number; width?: number }): Voice {
  // A filter rings for a few of its time constants after a hit, then rests (and costs nothing).
  const bank = opts.freqs.map((f) => ({ f, l: new Biquad("bp", f, opts.q), r: new Biquad("bp", f, opts.q), ring: Math.ceil(((12 * opts.q) / (Math.PI * f)) * RATE), left: 0 }));
  return (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      let hit = -1, inL = 0, inR = 0;
      if (rnd() < opts.rate(i / RATE) / RATE) {
        hit = Math.floor(rnd() * bank.length);
        const a = opts.amp() * (rnd() < 0.5 ? 1 : -1);
        const side = pan((rnd() * 2 - 1) * (opts.width ?? 1));
        inL = a * side[0];
        inR = a * side[1];
        const b = bank[hit];
        if (b.left <= 0) {
          b.l = new Biquad("bp", b.f, opts.q);
          b.r = new Biquad("bp", b.f, opts.q);
        }
        b.left = b.ring;
      }
      for (let k = 0; k < bank.length; k++) {
        const b = bank[k];
        if (b.left <= 0) continue;
        b.left--;
        L[i] += b.l.step(k === hit ? inL : 0);
        R[i] += b.r.step(k === hit ? inR : 0);
      }
    }
  };
}

/** A filtered noise bed, decorrelated between the channels, with a slow swell. */
function bed(rnd: () => number, opts: { kind: "pink" | "brown"; lp?: number; hp?: number; gain: number; wobble?: number; depth?: number }): Voice {
  const src = [opts.kind === "pink" ? new Pink(rnd) : new Brown(rnd), opts.kind === "pink" ? new Pink(rnd) : new Brown(rnd)];
  const lp = opts.lp ? [new Biquad("lp", opts.lp), new Biquad("lp", opts.lp)] : null;
  const hp = opts.hp ? [new Biquad("hp", opts.hp), new Biquad("hp", opts.hp)] : null;
  const wob = opts.wobble ? new Wobble(rnd, opts.wobble) : null;
  const depth = opts.depth ?? 0.3;
  return (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      const g = opts.gain * (wob ? 1 - depth + depth * 2 * wob.step() : 1);
      for (let c = 0; c < 2; c++) {
        let x = src[c].step();
        if (hp) x = hp[c].step(x);
        if (lp) x = lp[c].step(x);
        (c ? R : L)[i] += x * g;
      }
    }
  };
}

function rain(rnd: () => number, heavy: boolean): Voice[] {
  return [
    // The hush of rain all around, with body rather than hiss.
    bed(rnd, { kind: "pink", hp: 300, lp: 5000, gain: heavy ? 0.36 : 0.24, wobble: 3, depth: 0.12 }),
    bed(rnd, { kind: "brown", lp: 420, gain: heavy ? 0.24 : 0.16, wobble: 5, depth: 0.2 }),
    // Countless small drops…
    sparkles(rnd, {
      rate: () => (heavy ? 220 : 160),
      freqs: [1400, 2000, 2700, 3400, 4300, 5400],
      q: 6,
      amp: () => 0.08 + 0.7 * rnd() ** 3,
    }),
    // …and now and then a big one close by, on the sill.
    sparkles(rnd, { rate: () => 2.2, freqs: [900, 1250, 1700], q: 10, amp: () => 0.4 + 0.5 * rnd(), width: 0.6 }),
  ];
}

/** Thunder: a crack, then a long rumble that rolls away. */
function thunder(rnd: () => number, at: number[]): Voice {
  const brown = [new Brown(rnd), new Brown(rnd)];
  const lp = [new Biquad("lp", 400), new Biquad("lp", 400)];
  const crack = [new Biquad("bp", 1800, 0.8), new Biquad("bp", 1800, 0.8)];
  const wob = new Wobble(rnd, 0.35);
  return (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      const t = i / RATE;
      let env = 0, cr = 0;
      for (const s of at) {
        const d = t - s;
        if (d < 0 || d > 9) continue;
        env += Math.min(1, d / 0.35) * Math.exp(-d / 2.4);
        if (d < 0.25) cr += Math.exp(-d / 0.05);
      }
      if (i % 64 === 0) {
        const f = 90 + 500 * Math.min(1, env);
        lp[0].set("lp", f); lp[1].set("lp", f);
      }
      const roll = 0.55 + 0.9 * wob.step();
      for (let c = 0; c < 2; c++) {
        const x = lp[c].step(brown[c].step()) * env * roll * 1.6 + crack[c].step(rnd() * 2 - 1) * cr * 0.6;
        (c ? R : L)[i] += x;
      }
    }
  };
}

function fire(rnd: () => number): Voice[] {
  const flicker = new Wobble(rnd, 0.6);
  return [
    bed(rnd, { kind: "brown", lp: 380, gain: 0.32, wobble: 1.4, depth: 0.35 }),
    bed(rnd, { kind: "pink", hp: 2500, lp: 9000, gain: 0.025, wobble: 0.8, depth: 0.5 }),
    // Crackles come in bursts.
    sparkles(rnd, { rate: () => 4 + 26 * flicker.step() ** 2, freqs: [1200, 1800, 2600, 3500, 4600], q: 1.6, amp: () => 0.08 + 1.4 * rnd() ** 5 }),
    // An occasional pop of a knot.
    sparkles(rnd, { rate: () => 0.5, freqs: [520, 780, 1050], q: 3, amp: () => 0.6 + rnd() }),
  ];
}

function sea(rnd: () => number, seconds: number): Voice[] {
  // Waves: a swell, the break, the foam running back.
  const waves: { at: number; len: number; size: number; p: number }[] = [];
  for (let t = -6; t < seconds + XFADE; ) {
    const len = 6.5 + rnd() * 3.5;
    waves.push({ at: t, len, size: 0.65 + rnd() * 0.45, p: rnd() * 1.2 - 0.6 });
    t += len * (0.62 + rnd() * 0.2);
  }
  const src = [new Pink(rnd), new Pink(rnd)];
  const lp = [new Smooth(), new Smooth()];
  const hp = [new Biquad("hp", 120), new Biquad("hp", 120)];
  const fizz = [new Biquad("hp", 3000), new Biquad("hp", 3000)];
  const surf: Voice = (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      const t = i / RATE;
      let envL = 0, envR = 0, foam = 0;
      for (const w of waves) {
        const d = (t - w.at) / w.len;
        if (d < 0 || d > 1) continue;
        // Rises for 40 % of the wave, breaks, then fades.
        const e = d < 0.4 ? Math.sin((d / 0.4) * (Math.PI / 2)) ** 2 : Math.exp(-(d - 0.4) * 4.2);
        const [pl, pr] = pan(w.p);
        envL += e * w.size * pl * 1.4;
        envR += e * w.size * pr * 1.4;
        if (d > 0.36) foam += Math.exp(-(d - 0.36) * 6) * w.size;
      }
      for (let c = 0; c < 2; c++) {
        const env = c ? envR : envL;
        const x = src[c].step();
        const bright = coef(250 + 2600 * Math.min(1, env));
        const y = hp[c].step(lp[c].step(x, bright)) * env * 0.9 + fizz[c].step(x) * foam * 0.07;
        (c ? R : L)[i] += y;
      }
    }
  };
  return [surf, bed(rnd, { kind: "brown", lp: 240, gain: 0.14, wobble: 4, depth: 0.25 })];
}

/** Birdsong: whistles, chirps and trills now and then, here and there. */
function birds(rnd: () => number, seconds: number): Voice {
  interface Note { at: number; dur: number; f0: number; f1: number; amp: number; p: [number, number]; am?: number }
  const notes: Note[] = [];
  for (let t = 0.5; t < seconds + XFADE; t += 1.2 + rnd() * 2.8) {
    const kind = Math.floor(rnd() * 3);
    const p = pan(rnd() * 1.6 - 0.8);
    const amp = 0.05 + rnd() * 0.08;
    if (kind === 0) {
      // A whistle of two to four notes.
      const n = 2 + Math.floor(rnd() * 3);
      const base = 2000 + rnd() * 1400;
      for (let k = 0; k < n; k++) notes.push({ at: t + k * 0.24, dur: 0.16 + rnd() * 0.06, f0: base * (1 + (rnd() - 0.4) * 0.3), f1: base * (1 + (rnd() - 0.3) * 0.4), amp, p });
    } else if (kind === 1) {
      // Quick chirps going down.
      const n = 5 + Math.floor(rnd() * 5);
      const top = 4200 + rnd() * 1500;
      for (let k = 0; k < n; k++) notes.push({ at: t + k * 0.075, dur: 0.045, f0: top, f1: top * 0.72, amp: amp * 0.8, p });
    } else {
      notes.push({ at: t, dur: 0.6 + rnd() * 0.5, f0: 3800 + rnd() * 900, f1: 3600 + rnd() * 900, amp: amp * 0.7, p, am: 26 + rnd() * 14 });
    }
  }
  let next = 0;
  const active: { n: Note; phase: number }[] = [];
  return (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      const t = i / RATE;
      while (next < notes.length && notes[next].at <= t) active.push({ n: notes[next++], phase: 0 });
      for (let k = active.length - 1; k >= 0; k--) {
        const a = active[k];
        const d = (t - a.n.at) / a.n.dur;
        if (d >= 1) {
          active.splice(k, 1);
          continue;
        }
        const f = a.n.f0 + (a.n.f1 - a.n.f0) * d;
        a.phase += (2 * Math.PI * f) / RATE;
        let env = Math.sin(Math.PI * d) ** 2;
        if (a.n.am) env *= 0.5 + 0.5 * Math.sin(2 * Math.PI * a.n.am * (t - a.n.at));
        const x = (Math.sin(a.phase) + 0.18 * Math.sin(2 * a.phase)) * env * a.n.amp;
        L[i] += x * a.n.p[0];
        R[i] += x * a.n.p[1];
      }
    }
  };
}

/** Crickets: each sings short chirps of a few pulses, on its own beat. */
function crickets(rnd: () => number): Voice {
  const singers = [4300, 4750, 5150].map((f, k) => ({
    f, amp: [0.06, 0.04, 0.032][k], period: 0.55 + rnd() * 0.3, offset: rnd(), pulses: 3 + (k % 2), p: pan([-0.5, 0.45, 0.05][k]), phase: 0,
  }));
  return (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      const t = i / RATE;
      for (const s of singers) {
        s.phase += (2 * Math.PI * s.f) / RATE;
        const inChirp = ((t + s.offset * s.period) % s.period);
        const k = Math.floor(inChirp / 0.042);
        if (k >= s.pulses) continue;
        const d = (inChirp - k * 0.042) / 0.02;
        if (d >= 1) continue;
        const x = (Math.sin(s.phase) + 0.25 * Math.sin(2 * s.phase)) * Math.sin(Math.PI * d) * s.amp;
        L[i] += x * s.p[0];
        R[i] += x * s.p[1];
      }
    }
  };
}

/** Wheels over rail joints: «та-так… та-так», with the carriage's rumble and sway. */
function train(rnd: () => number): Voice[] {
  const PERIOD = 1.2;
  const hits = [[0, 1], [0.12, 0.8], [0.58, 0.7], [0.7, 0.9]] as const;
  const click = [new Biquad("bp", 950, 2.2), new Biquad("bp", 950, 2.2)];
  const thump = [new Biquad("bp", 75, 3), new Biquad("bp", 75, 3)];
  const clacks: Voice = (L, R, from, to) => {
    for (let i = from; i < to; i++) {
      const t = (i / RATE) % PERIOD;
      let e = 0;
      for (const [at, a] of hits) {
        const d = t - at;
        if (d >= 0 && d < 0.03) e += a * Math.exp(-d / 0.006);
      }
      for (let c = 0; c < 2; c++) {
        const n = rnd() * 2 - 1;
        const x = click[c].step(n * e * 0.9) + thump[c].step(e * 2.2) * 1.6;
        (c ? R : L)[i] += x * (c ? 0.92 : 1);
      }
    }
  };
  return [
    bed(rnd, { kind: "brown", lp: 170, gain: 0.5, wobble: 2.5, depth: 0.15 }),
    bed(rnd, { kind: "pink", hp: 300, lp: 1300, gain: 0.07, wobble: 3.3, depth: 0.35 }),
    clacks,
  ];
}

export const AMBIENT_SECONDS: Record<AmbientId, number> = { rain: 20, storm: 40, fire: 24, sea: 32, forest: 30, night: 24, train: 24 };

function voices(id: AmbientId, seconds: number): Voice[] {
  const rnd = random(id.length * 7919 + id.charCodeAt(0));
  switch (id) {
    case "rain": return rain(rnd, false);
    case "storm": return [...rain(rnd, true), bed(rnd, { kind: "pink", lp: 650, gain: 0.12, wobble: 4, depth: 0.7 }), thunder(rnd, [7, 26])];
    case "fire": return fire(rnd);
    case "sea": return sea(rnd, seconds);
    case "forest": return [bed(rnd, { kind: "pink", hp: 500, lp: 3800, gain: 0.07, wobble: 5, depth: 0.6 }), birds(rnd, seconds)];
    case "night": return [bed(rnd, { kind: "brown", lp: 420, gain: 0.06, wobble: 6, depth: 0.4 }), crickets(rnd)];
    case "train": return train(rnd);
  }
}

/** Render a sound's loop: stereo samples at RATE, levelled to a common loudness. */
export async function renderAmbient(id: AmbientId): Promise<[Float32Array, Float32Array]> {
  const seconds = AMBIENT_SECONDS[id];
  const total = (seconds + XFADE) * RATE;
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const vs = voices(id, seconds);
  const SLICE = RATE / 4;
  for (let from = 0; from < total; from += SLICE) {
    const to = Math.min(total, from + SLICE);
    for (const v of vs) v(L, R, from, to);
    // Let the screen breathe between slices.
    await new Promise((r) => setTimeout(r, 0));
  }

  // The tail fades into the head: the loop's end runs on into its start.
  const n = seconds * RATE;
  const x = XFADE * RATE;
  const outL = L.subarray(0, n);
  const outR = R.subarray(0, n);
  for (let i = 0; i < x; i++) {
    const a = Math.sin((i / x) * (Math.PI / 2));
    const b = Math.cos((i / x) * (Math.PI / 2));
    outL[i] = L[i] * a + L[n + i] * b;
    outR[i] = R[i] * a + R[n + i] * b;
  }

  // The same loudness for every sound, without clipping.
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) {
    sum += outL[i] * outL[i] + outR[i] * outR[i];
    peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
  }
  const rms = Math.sqrt(sum / (2 * n)) || 1;
  const gain = Math.min(0.14 / rms, 0.95 / (peak || 1));
  for (let i = 0; i < n; i++) {
    outL[i] *= gain;
    outR[i] *= gain;
  }
  return [outL.slice(), outR.slice()];
}

"use client";

/**
 * Paper sounds for the reader, made on the spot from noise: the swish of a page turning over and its soft landing,
 * and the rustle of a page held and bent under the finger (louder the faster it moves). They go straight to the
 * speakers, under the reader's own setting; as interface sounds they follow the phone's silent switch.
 */
import { audioContext, audioIdle, unlockAudio } from "./ambient";

let noise: AudioBuffer | null = null;

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== ac.sampleRate) {
    noise = ac.createBuffer(1, Math.round(ac.sampleRate * 1.5), ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** A page turning over: a swish that rises and falls, then the page settling. `strength` 0..1. */
export function playPageFlip(strength = 1): void {
  let ac: AudioContext;
  try {
    ac = unlockAudio();
  } catch {
    return;
  }
  const s = Math.max(0.25, Math.min(1, strength));
  const t = ac.currentTime + 0.01;
  const buf = noiseBuffer(ac);
  const vary = 0.85 + Math.random() * 0.3;

  // The swish: band-passed noise sweeping up as the page lifts, down as it falls.
  const swish = ac.createBufferSource();
  swish.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 280;
  const bp = ac.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.8;
  bp.frequency.setValueAtTime(800 * vary, t);
  bp.frequency.exponentialRampToValueAtTime(3900 * vary, t + 0.15);
  bp.frequency.exponentialRampToValueAtTime(1400 * vary, t + 0.34);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.38 * s, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.16 * s, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  swish.connect(hp).connect(bp).connect(g).connect(ac.destination);
  swish.start(t, Math.random() * 0.9);
  swish.stop(t + 0.45);

  // The landing: a short, soft, low flap.
  const flap = ac.createBufferSource();
  flap.buffer = buf;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 950;
  const g2 = ac.createGain();
  const land = t + 0.27 * vary;
  g2.gain.setValueAtTime(0.0001, land);
  g2.gain.exponentialRampToValueAtTime(0.3 * s, land + 0.012);
  g2.gain.exponentialRampToValueAtTime(0.0001, land + 0.09);
  flap.connect(lp).connect(g2).connect(ac.destination);
  flap.start(land, Math.random() * 0.9);
  flap.stop(land + 0.12);

  swish.onended = () => audioIdle();
}

let rustle: { src: AudioBufferSourceNode; gain: GainNode; band: BiquadFilterNode } | null = null;

/** The page is taken by the finger: a rustle starts (silent until it moves). */
export function rustleStart(): void {
  if (rustle) return;
  let ac: AudioContext;
  try {
    ac = unlockAudio();
  } catch {
    return;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  src.loop = true;
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  const band = ac.createBiquadFilter();
  band.type = "bandpass";
  band.Q.value = 0.6;
  band.frequency.value = 2400;
  const gain = ac.createGain();
  gain.gain.value = 0;
  src.connect(hp).connect(band).connect(gain).connect(ac.destination);
  src.start(0, Math.random());
  rustle = { src, gain, band };
}

/** How fast the page moves under the finger (pixels per millisecond). */
export function rustleSpeed(speed: number): void {
  if (!rustle) return;
  const ac = audioContext();
  const v = Math.min(1, Math.abs(speed) / 2);
  rustle.gain.gain.setTargetAtTime(0.2 * v, ac.currentTime, 0.04);
  rustle.band.frequency.setTargetAtTime(1600 + 3200 * v, ac.currentTime, 0.05);
}

export function rustleStop(): void {
  if (!rustle) return;
  const ac = audioContext();
  const { src, gain } = rustle;
  rustle = null;
  gain.gain.cancelScheduledValues(ac.currentTime);
  gain.gain.setTargetAtTime(0, ac.currentTime, 0.04);
  src.stop(ac.currentTime + 0.2);
  audioIdle();
}

"use client";

/**
 * A quote as a picture for messengers and stories (1080 × 1350): the passage in the reader's serif on the colour
 * of the book's cover, with the book and its author underneath.
 */
import type { Tone } from "../covers/tone";
import { getLang } from "../i18n";
import { shareImage, wrapLines } from "../share";

const W = 1080;
const H = 1350;
const CREAM = "#FFF6EA";

const hsl = (h: number, s: number, l: number) => `hsl(${(h * 360).toFixed(1)} ${(Math.min(1, Math.max(0, s)) * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

function family(variable: string, fallback: string): string {
  const v = getComputedStyle(document.body).getPropertyValue(variable).trim() || getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

export interface QuoteCard {
  text: string;
  title: string;
  author: string;
  tone: Tone | null;
}

export async function drawQuote(q: QuoteCard): Promise<Blob> {
  const serif = family("--font-literata", "Georgia, serif");
  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  await Promise.all([document.fonts?.load(`500 48px ${serif}`), document.fonts?.ready]).catch(() => undefined);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // The cover's colour, deep; a warm brown for covers without one.
  const { h, s } = !q.tone || q.tone.grey ? { h: 22 / 360, s: 0.42 } : q.tone;
  const S = Math.max(s, 0.34);
  const bg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  bg.addColorStop(0, hsl(h, S, 0.36));
  bg.addColorStop(1, hsl(h, S * 0.9, 0.17));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.9, H * 0.05, 0, W * 0.9, H * 0.05, 760);
  glow.addColorStop(0, "rgba(255,240,220,0.22)");
  glow.addColorStop(1, "rgba(255,240,220,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const pad = 100;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,246,234,0.3)";
  ctx.font = `700 280px ${serif}`;
  ctx.fillText(getLang() === "ru" ? "«" : "“", pad - 14, 330);

  // A passage cut off mid-sentence («…сказал один из гостей,») ends with an ellipsis on the picture.
  const text = q.text.trim().replace(/\s*[,;:–—-]+$/, "…");

  // The passage, as large as it fits.
  const top = 360;
  const bottom = 1030;
  let size = 68;
  let lines: string[] = [];
  let lh = 0;
  for (; size >= 34; size -= 2) {
    ctx.font = `500 ${size}px ${serif}`;
    lh = Math.round(size * 1.4);
    lines = wrapLines(ctx, text, W - pad * 2, 1000);
    if (lines.length * lh <= bottom - top) break;
  }
  if (lines.length * lh > bottom - top) {
    size = 34;
    lh = Math.round(size * 1.4);
    ctx.font = `500 ${size}px ${serif}`;
    lines = wrapLines(ctx, text, W - pad * 2, Math.floor((bottom - top) / lh));
  }
  ctx.fillStyle = CREAM;
  let y = top + Math.max(0, (bottom - top - lines.length * lh) / 2) + size;
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += lh;
  }

  // The book.
  ctx.fillStyle = "rgba(255,246,234,0.4)";
  ctx.fillRect(pad, 1080, 120, 3);
  ctx.fillStyle = CREAM;
  ctx.font = `800 40px ${sans}`;
  ctx.fillText(wrapLines(ctx, q.title, W - pad * 2, 1)[0] ?? "", pad, 1150);
  if (q.author) {
    ctx.fillStyle = "rgba(255,246,234,0.78)";
    ctx.font = `500 32px ${sans}`;
    ctx.fillText(wrapLines(ctx, q.author, W - pad * 2, 1)[0] ?? "", pad, 1200);
  }
  ctx.fillStyle = "rgba(255,246,234,0.55)";
  ctx.font = `700 26px ${sans}`;
  ctx.letterSpacing = "4px";
  const mark = "BOOWIE";
  ctx.fillText(mark, W - pad - ctx.measureText(mark).width, H - 70);
  ctx.letterSpacing = "0px";

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"));
}

/** Draw the quote and hand it to the share sheet. */
export async function shareQuote(q: QuoteCard): Promise<"shared" | "downloaded"> {
  const blob = await drawQuote(q);
  const slug = q.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 40) || "quote";
  return shareImage(blob, `boowie-${slug}.png`, q.title);
}

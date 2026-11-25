"use client";

/**
 * A passage from a book as a picture to repost or keep: the words in the reader's serif, the author and the book
 * (with its small cover) underneath, and «Boowie · by MIW Labs» at the foot. Drawn on the device; nothing about it
 * is stored or sent anywhere unless the reader shares the picture.
 *
 * Four looks — the cover's colour, warm paper, night, the cover itself blurred behind — and three shapes: a story
 * (9:16), a post (4:5) and a square.
 */
import type { Tone } from "../covers/tone";
import { getLang } from "../i18n";
import { saveImage, shareImage, wrapLines } from "../share";
import { withBase } from "../basePath";

export type CardStyle = "cover" | "paper" | "night" | "photo";
export type CardFormat = "story" | "post" | "square";

export const CARD_SIZES: Record<CardFormat, [number, number]> = { story: [1080, 1920], post: [1080, 1350], square: [1080, 1080] };

export interface QuoteCard {
  text: string;
  title: string;
  author: string;
  tone: Tone | null;
  /** The cover (a same-origin or blob URL), for the small cover and the blurred look. */
  cover?: string;
  /** The book is an audiobook: its cover is square. */
  audio?: boolean;
  style?: CardStyle;
  format?: CardFormat;
}

interface Palette {
  ink: string;
  muted: string;
  mark: string;
  /** The «I» of the MIW wordmark: MIW's comet blue, for a light or a dark ground. */
  comet: string;
  rule: string;
}

const hsl = (h: number, s: number, l: number) => `hsl(${(h * 360).toFixed(1)} ${(Math.min(1, Math.max(0, s)) * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

function family(variable: string, fallback: string): string {
  const v = getComputedStyle(document.body).getPropertyValue(variable).trim() || getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draw `img` over the box like `object-fit: cover`. */
function cover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, x + (w - img.width * s) / 2, y + (h - img.height * s) / 2, img.width * s, img.height * s);
}

/** The ground of the picture, and the colours to write on it. */
function ground(ctx: CanvasRenderingContext2D, W: number, H: number, style: CardStyle, tone: Tone | null, img: HTMLImageElement | null): Palette {
  const { h, s } = !tone || tone.grey ? { h: 22 / 360, s: 0.42 } : tone;
  const S = Math.max(s, 0.34);
  const light: Palette = { ink: "#FFF6EA", muted: "rgba(255,246,234,0.74)", mark: "rgba(255,246,234,0.32)", comet: "#7FA8FF", rule: "rgba(255,246,234,0.35)" };

  if (style === "paper") {
    ctx.fillStyle = "#F6F1E9";
    ctx.fillRect(0, 0, W, H);
    // A soft edge, as of a page.
    const edge = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    edge.addColorStop(0, "rgba(120,90,60,0)");
    edge.addColorStop(1, "rgba(120,90,60,0.10)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, W, H);
    return { ink: "#1D1814", muted: "#776C61", mark: "rgba(180,81,44,0.55)", comet: "#1F57D6", rule: "rgba(29,24,20,0.18)" };
  }
  if (style === "night") {
    ctx.fillStyle = "#100D0B";
    ctx.fillRect(0, 0, W, H);
    return { ink: "#F3ECE1", muted: "#A39889", mark: "rgba(217,140,104,0.6)", comet: "#7FA8FF", rule: "rgba(243,236,225,0.2)" };
  }
  if (style === "photo" && img) {
    // The cover, blurred: drawn tiny and stretched back (works where canvas filters don't).
    const small = document.createElement("canvas");
    small.width = 18;
    small.height = Math.round((18 * H) / W);
    const sctx = small.getContext("2d")!;
    cover(sctx, img, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, W, H);
    ctx.fillStyle = "rgba(10,8,6,0.5)";
    ctx.fillRect(0, 0, W, H);
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(10,8,6,0.05)");
    shade.addColorStop(1, "rgba(10,8,6,0.45)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    return light;
  }
  // The cover's colour, deep; a warm brown for covers without one.
  const bg = ctx.createLinearGradient(0, 0, W * 0.5, H);
  bg.addColorStop(0, hsl(h, S, 0.36));
  bg.addColorStop(1, hsl(h, S * 0.9, 0.17));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.9, H * 0.05, 0, W * 0.9, H * 0.05, Math.max(W, H) * 0.56);
  glow.addColorStop(0, "rgba(255,240,220,0.22)");
  glow.addColorStop(1, "rgba(255,240,220,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  return light;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function drawQuote(q: QuoteCard): Promise<Blob> {
  const style = q.style ?? "cover";
  const [W, H] = CARD_SIZES[q.format ?? "post"];
  const serif = family("--font-literata", "Georgia, serif");
  const sans = getComputedStyle(document.body).fontFamily || "sans-serif";
  const onest = family("--font-onest", sans);
  await Promise.all([
    document.fonts?.load(`500 48px ${serif}`),
    document.fonts?.load(`italic 500 48px ${serif}`),
    document.fonts?.load(`700 30px ${onest}`),
    document.fonts?.ready,
  ]).catch(() => undefined);
  const [img, icon] = await Promise.all([q.cover ? loadImage(q.cover) : Promise.resolve(null), loadImage(withBase("/icons/icon-192.png"))]);

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const c = ground(ctx, W, H, style === "photo" && !img ? "cover" : style, q.tone, img);
  ctx.textBaseline = "alphabetic";
  const pad = W >= 1080 ? 96 : 72;
  const ru = getLang() === "ru";

  // ── The foot: Boowie · by MIW Labs ─────────────────────────────────────────────────────────────────────────
  const footY = H - (H > 1500 ? 110 : 76);
  let x = pad;
  if (icon) {
    ctx.save();
    roundRect(ctx, x, footY - 34, 44, 44, 11);
    ctx.clip();
    ctx.drawImage(icon, x, footY - 34, 44, 44);
    ctx.restore();
    x += 58;
  }
  ctx.fillStyle = c.ink;
  ctx.font = `800 30px ${sans}`;
  ctx.fillText("Boowie", x, footY);
  x += ctx.measureText("Boowie").width;
  ctx.fillStyle = c.muted;
  ctx.font = `500 28px ${sans}`;
  const by = "  ·  by ";
  ctx.fillText(by, x, footY);
  x += ctx.measureText(by).width;
  // The MIW wordmark: Onest 700, tight, the «I» in comet blue.
  ctx.font = `700 30px ${onest}`;
  ctx.letterSpacing = "-1px";
  for (const [ch, color] of [["M", c.ink], ["I", c.comet], ["W", c.ink]] as const) {
    ctx.fillStyle = color;
    ctx.fillText(ch, x, footY);
    x += ctx.measureText(ch).width - 1;
  }
  ctx.letterSpacing = "0px";
  ctx.fillStyle = c.ink;
  ctx.font = `500 30px ${onest}`;
  ctx.fillText(" Labs", x + 1, footY);

  // ── The book: its small cover, the author, the title ───────────────────────────────────────────────────────
  const thumbH = H > 1500 ? 168 : H > 1200 ? 150 : 126;
  const thumbW = q.audio ? thumbH : Math.round(thumbH * 0.667);
  const bookBottom = footY - (H > 1500 ? 110 : 78);
  const bookTop = bookBottom - thumbH;
  let tx = pad;
  if (img) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    roundRect(ctx, pad, bookTop, thumbW, thumbH, 10);
    ctx.fillStyle = "#2A1A12";
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, pad, bookTop, thumbW, thumbH, 10);
    ctx.clip();
    cover(ctx, img, pad, bookTop, thumbW, thumbH);
    ctx.restore();
    tx = pad + thumbW + 32;
  } else {
    ctx.fillStyle = c.rule;
    ctx.fillRect(pad, bookTop + 8, 96, 3);
  }
  const tw = W - tx - pad;
  ctx.font = `800 40px ${sans}`;
  const titleLines = wrapLines(ctx, ru ? `«${q.title}»` : `“${q.title}”`, tw, 2);
  ctx.font = `500 31px ${sans}`;
  const authorLine = q.author ? wrapLines(ctx, q.author, tw, 1)[0] : "";
  const blockH = titleLines.length * 48 + (authorLine ? 44 : 0);
  let by2 = img ? bookTop + (thumbH - blockH) / 2 + 38 : bookTop + 64;
  if (authorLine) {
    ctx.fillStyle = c.muted;
    ctx.fillText(`— ${authorLine}`, tx, by2);
    by2 += 50;
  }
  ctx.fillStyle = c.ink;
  ctx.font = `800 40px ${sans}`;
  for (const line of titleLines) {
    ctx.fillText(line, tx, by2);
    by2 += 48;
  }

  // ── The passage, as large as it fits ───────────────────────────────────────────────────────────────────────
  const markSize = H > 1500 ? 300 : H > 1200 ? 260 : 210;
  const markY = pad + markSize * 0.82;
  ctx.fillStyle = c.mark;
  ctx.font = `700 ${markSize}px ${serif}`;
  ctx.fillText(ru ? "«" : "“", pad - 12, markY);

  // A passage cut off mid-sentence («…сказал один из гостей,») ends with an ellipsis on the picture.
  const text = q.text.trim().replace(/\s+/g, " ").replace(/\s*[,;:–—-]+$/, "…");
  const top = markY + 24;
  const bottom = bookTop - (H > 1500 ? 90 : 60);
  const [maxSize, minSize] = H > 1500 ? [76, 38] : H > 1200 ? [68, 34] : [60, 30];
  let size = maxSize;
  let lines: string[] = [];
  let lh = 0;
  for (; size >= minSize; size -= 2) {
    ctx.font = `500 ${size}px ${serif}`;
    lh = Math.round(size * 1.38);
    lines = wrapLines(ctx, text, W - pad * 2, 1000);
    if (lines.length * lh <= bottom - top) break;
  }
  if (lines.length * lh > bottom - top) {
    size = minSize;
    lh = Math.round(size * 1.38);
    ctx.font = `500 ${size}px ${serif}`;
    lines = wrapLines(ctx, text, W - pad * 2, Math.max(1, Math.floor((bottom - top) / lh)));
  }
  ctx.fillStyle = c.ink;
  let y = top + Math.max(0, (bottom - top - lines.length * lh) / 2) + size;
  for (const line of lines) {
    ctx.fillText(line, pad, y);
    y += lh;
  }

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"));
}

// Russian letters in Latin, for file names (browsers may turn a non-Latin download name into «download»).
const LATIN: Record<string, string> = Object.fromEntries(
  "а:a б:b в:v г:g д:d е:e ё:e ж:zh з:z и:i й:y к:k л:l м:m н:n о:o п:p р:r с:s т:t у:u ф:f х:kh ц:ts ч:ch ш:sh щ:shch ъ: ы:y ь: э:e ю:yu я:ya" // i18n-ignore
    .split(" ")
    .map((pair) => pair.split(":") as [string, string]),
);

/** A file name for the picture: the book's name (in Latin letters) and the shape. */
export function cardName(q: Pick<QuoteCard, "title" | "format">): string {
  const latin = [...q.title.toLowerCase()].map((ch) => LATIN[ch] ?? ch).join("");
  const slug = latin.normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "quote";
  return `boowie-${slug}-${q.format ?? "post"}.png`;
}

/** Hand the picture to the share sheet. */
export function shareCard(blob: Blob, q: Pick<QuoteCard, "title" | "format">): Promise<"shared" | "downloaded"> {
  return shareImage(blob, cardName(q), q.title);
}

/** Keep the picture on the device. */
export function saveCard(blob: Blob, q: Pick<QuoteCard, "title" | "format">): Promise<"saved" | "shared"> {
  return saveImage(blob, cardName(q), q.title);
}

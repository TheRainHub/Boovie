"use client";

/**
 * The year's summary as a picture for stories and messengers (1080 × 1920), drawn on a canvas in the app's own
 * font, and handed to the system's share sheet: the native one in the apps, Web Share where the browser shares
 * files, or a download.
 */
import { t } from "../i18n";
import { shareImage, wrapLines as wrap } from "../share";
import { getFileUrl } from "../storage/blobStore";
import type { Wrapped } from "./wrapped";

const W = 1080;
const H = 1920;
const CREAM = "#FFF6EA";

export interface ShareInfo {
  rows: [string, string][];
  persona: string;
  top: { fileId?: string; url?: string; audio: boolean; title: string; author: string } | null;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function drawWrapped(w: Wrapped, info: ShareInfo): Promise<Blob> {
  await document.fonts?.ready;
  const family = getComputedStyle(document.body).fontFamily || "sans-serif";
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, "#C2582F");
  bg.addColorStop(1, "#5A200D");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // A soft light in the corner.
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.08, 0, W * 0.85, H * 0.08, 700);
  glow.addColorStop(0, "rgba(255,217,188,0.35)");
  glow.addColorStop(1, "rgba(255,217,188,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const pad = 96;
  ctx.fillStyle = CREAM;
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 34px ${family}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(`BOOWIE · ${w.year}`, pad, 190);
  ctx.letterSpacing = "0px";

  ctx.font = `800 104px ${family}`;
  let y = 330;
  for (const line of wrap(ctx, t("Мой {year} с книгами", { year: w.year }), W - pad * 2, 3)) {
    ctx.fillText(line, pad, y);
    y += 112;
  }

  // The book of the year.
  y += 40;
  if (info.top) {
    const cw = info.top.audio ? 300 : 260;
    const ch = info.top.audio ? 300 : 390;
    const src = info.top.fileId ? await getFileUrl(info.top.fileId) : info.top.url;
    const img = src ? await loadImage(src) : null;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    roundRect(ctx, pad, y, cw, ch, 18);
    ctx.fillStyle = "#2A1A12";
    ctx.fill();
    ctx.restore();
    if (img) {
      ctx.save();
      roundRect(ctx, pad, y, cw, ch, 18);
      ctx.clip();
      // Cover the box like object-fit: cover.
      const s = Math.max(cw / img.width, ch / img.height);
      ctx.drawImage(img, pad + (cw - img.width * s) / 2, y + (ch - img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore();
    }
    const tx = pad + cw + 48;
    const tw = W - tx - pad;
    ctx.fillStyle = "rgba(255,246,234,0.75)";
    ctx.font = `700 30px ${family}`;
    ctx.fillText(t("Книга года").toUpperCase(), tx, y + 52);
    ctx.fillStyle = CREAM;
    ctx.font = `800 58px ${family}`;
    let ty = y + 130;
    for (const line of wrap(ctx, info.top.title, tw, 3)) {
      ctx.fillText(line, tx, ty);
      ty += 64;
    }
    ctx.fillStyle = "rgba(255,246,234,0.8)";
    ctx.font = `500 36px ${family}`;
    for (const line of wrap(ctx, info.top.author, tw, 2)) {
      ctx.fillText(line, tx, ty + 6);
      ty += 44;
    }
    y += ch + 90;
  }

  // The numbers, two to a row.
  const col = (W - pad * 2) / 2;
  info.rows.slice(0, 6).forEach(([k, v], i) => {
    const x = pad + (i % 2) * col;
    const ry = y + Math.floor(i / 2) * 190;
    ctx.fillStyle = "rgba(255,246,234,0.72)";
    ctx.font = `500 34px ${family}`;
    ctx.fillText(k, x, ry + 40);
    ctx.fillStyle = CREAM;
    ctx.font = `800 70px ${family}`;
    ctx.fillText(wrap(ctx, v, col - 30, 1)[0], x, ry + 120);
  });
  y += Math.ceil(Math.min(6, info.rows.length) / 2) * 190 + 30;

  // The reader type, in a pill.
  ctx.font = `800 46px ${family}`;
  const label = info.persona;
  const lw = ctx.measureText(label).width + 80;
  roundRect(ctx, pad, y, lw, 96, 48);
  ctx.fillStyle = CREAM;
  ctx.fill();
  ctx.fillStyle = "#5A200D";
  ctx.fillText(label, pad + 40, y + 64);

  ctx.fillStyle = "rgba(255,246,234,0.7)";
  ctx.font = `500 32px ${family}`;
  ctx.fillText(t("Boowie — книги и аудиокниги"), pad, H - 110);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/png"));
}

/** Draw the picture and hand it to the share sheet (or download it where sharing files isn't possible). */
export async function shareWrapped(w: Wrapped, info: ShareInfo): Promise<"shared" | "downloaded"> {
  const blob = await drawWrapped(w, info);
  return shareImage(blob, `boowie-${w.year}.png`, t("Мой {year} с книгами", { year: w.year }));
}

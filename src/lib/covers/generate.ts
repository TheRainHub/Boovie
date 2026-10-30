import { t } from "../i18n";
/**
 * Offline cover for books without one: a typeset plate in the app's visual language
 * (warm earth ground, hairline frame, bold Golos title, an imprint line, a geometric mark).
 * Deterministic per title, so the same book always gets the same cover.
 */

/** The store covers' palette: wine, espresso, sea, navy, olive, terracotta, oat, ivory, ochre. */
const TINTS: [string, string, boolean][] = [
  ["#7A2B30", "#36111A", true],
  ["#3E2B22", "#140D0A", true],
  ["#3C6762", "#1A3230", true],
  ["#2F4166", "#131B33", true],
  ["#68673A", "#2C2B15", true],
  ["#A3532F", "#4A2010", true],
  ["#EEE4D2", "#CDBC9E", false],
  ["#F3ECDF", "#D8CAB2", false],
  ["#DCA55A", "#A8722C", false],
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function cssFont(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function mark(ctx: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number) {
  ctx.beginPath();
  switch (kind % 5) {
    case 0: // concentric rings
      for (const k of [1, 0.72, 0.44]) { ctx.moveTo(cx + r * k, cy); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); }
      break;
    case 1: // horizon
      ctx.moveTo(cx - r, cy); ctx.arc(cx, cy, r * 0.62, Math.PI, 0);
      for (let i = 0; i < 5; i++) { const y = cy + 14 + i * 16; ctx.moveTo(cx - r, y); ctx.lineTo(cx + r, y); }
      break;
    case 2: // ruled grid
      for (let i = -3; i <= 3; i++) { ctx.moveTo(cx + i * r * 0.3, cy - r); ctx.lineTo(cx + i * r * 0.3, cy + r); }
      ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
      break;
    case 3: // diamond
      ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.7, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.7, cy); ctx.closePath();
      ctx.moveTo(cx, cy - r * 1.25); ctx.lineTo(cx, cy + r * 1.25);
      break;
    default: // single ring with a dot
      ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.moveTo(cx + 5, cy); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  }
  ctx.stroke();
}

export async function generateCover(opts: { title: string; author?: string; square: boolean; label?: string }): Promise<Blob> {
  const W = opts.square ? 800 : 600;
  const H = opts.square ? 800 : 900;
  const h = hash(`${opts.title}|${opts.author ?? ""}`);
  const [c1, c2, dark] = TINTS[h % TINTS.length];
  const fg = dark ? "#FFF6EA" : "#1D1814";
  const fg2 = dark ? "rgba(255,246,234,0.64)" : "rgba(29,24,20,0.6)";
  const rule = dark ? "rgba(255,246,234,0.18)" : "rgba(29,24,20,0.16)";

  await document.fonts?.ready;
  const sans = cssFont("--nf-ui", "-apple-system, system-ui, sans-serif");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const shine = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, H * 0.8);
  shine.addColorStop(0, dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.45)");
  shine.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shine;
  ctx.fillRect(0, 0, W, H);

  const m = 40;
  ctx.strokeStyle = rule;
  ctx.lineWidth = 1;
  ctx.strokeRect(m - 14.5, m - 14.5, W - 2 * (m - 14) + 1, H - 2 * (m - 14) + 1);

  // Author at the head of the plate.
  ctx.fillStyle = fg2;
  ctx.font = `500 26px ${sans}`;
  ctx.textBaseline = "top";
  if (opts.author) ctx.fillText(opts.author.slice(0, 40), m, m + 6);

  ctx.strokeStyle = fg;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 2;
  mark(ctx, h >> 3, W / 2, opts.square ? H * 0.4 : H * 0.38, opts.square ? 120 : 110);
  ctx.globalAlpha = 1;

  // Title: as large as fits in up to four lines.
  ctx.fillStyle = fg;
  ctx.textBaseline = "alphabetic";
  let size = opts.square ? 74 : 70;
  let lines: string[] = [];
  for (; size >= 34; size -= 4) {
    ctx.font = `700 ${size}px ${sans}`;
    lines = wrap(ctx, opts.title, W - 2 * m);
    if (lines.length <= 4) break;
  }
  lines = lines.slice(0, 4);
  const lead = size * 1.04;
  const bottom = H - m - 58;
  lines.forEach((l, i) => ctx.fillText(l, m, bottom - (lines.length - 1 - i) * lead));

  ctx.fillStyle = rule;
  ctx.fillRect(m, H - m - 34, W - 2 * m, 1);
  ctx.fillStyle = fg2;
  ctx.font = `600 15px ${sans}`;
  ctx.textBaseline = "top";
  ctx.fillText((opts.label ?? (opts.square ? t("АУДИОКНИГА") : t("КНИГА"))).toUpperCase(), m, H - m - 22);
  const id = `№ ${String(h % 10000).padStart(4, "0")}`;
  ctx.fillText(id, W - m - ctx.measureText(id).width, H - m - 22);

  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas"))), "image/jpeg", 0.88));
}

// Render store covers (public-domain paintings with the title set in Golos Text) and the PWA icons.
// Usage: node render_covers.mjs <catalog.source.json> <out-public-dir> <fonts-dir> <art-dir> [<icon-source.png>]
// <fonts-dir> holds the Golos Text woff2 files and a local.css with their @font-face rules (Google Fonts, SIL OFL).
// <icon-source.png> is the square app-icon artwork (a rounded tile on a dark ground); every icon size is cut from it.
// <art-dir>/<repo>/images/cover.jpg is the cover painting of a Standard Ebooks source repository — the
// paintings are in the public domain, Standard Ebooks' crops are CC0 (see README). Requires CHROMIUM_PATH.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [catalogPath, publicDir, fontsDir, artDir, iconSource] = process.argv.slice(2);
const fontFaces = readFileSync(join(fontsDir, 'local.css'), 'utf8');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function coverHtml(item, w, h) {
  const audio = item.kind === 'audiobook';
  const art = pathToFileURL(join(artDir, item.cover.art, 'images/cover.jpg')).href;
  const scale = w / 600;
  const len = item.title.length;
  const titleSize = Math.round((len > 26 ? 44 : len > 16 ? 54 : len > 10 ? 66 : 78) * scale * (audio ? 0.82 : 1));
  const pad = Math.round(46 * scale);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFaces}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${w}px;height:${h}px;overflow:hidden;background:#120e0b;font-family:'Golos Text',sans-serif;color:#FFF8EE}
  .art{position:absolute;inset:0;background:url("${art}") 50% ${Math.round(item.cover.focus * 100)}% / cover no-repeat}
  .scrim{position:absolute;inset:0;background:
    linear-gradient(to top, rgba(14,10,8,.94) 0%, rgba(14,10,8,.72) ${audio ? 26 : 22}%, rgba(14,10,8,.18) ${audio ? 52 : 46}%, rgba(14,10,8,0) 62%),
    linear-gradient(to bottom, rgba(14,10,8,.38) 0%, rgba(14,10,8,0) 18%)}
  .label{position:absolute;top:${pad}px;left:${pad}px;font-weight:700;font-size:${Math.round(15 * scale)}px;letter-spacing:.08em;text-transform:uppercase;
    padding:${Math.round(7 * scale)}px ${Math.round(12 * scale)}px;border-radius:999px;background:rgba(14,10,8,.45);backdrop-filter:blur(6px)}
  .bottom{position:absolute;left:${pad}px;right:${pad}px;bottom:${pad}px}
  .author{font-weight:500;font-size:${Math.round(24 * scale * (audio ? 0.85 : 1))}px;opacity:.84;margin-bottom:${Math.round(10 * scale)}px}
  .title{font-weight:800;font-size:${titleSize}px;line-height:.98;letter-spacing:-.025em;text-wrap:balance}
  .sub{margin-top:${Math.round(10 * scale)}px;font-weight:500;font-size:${Math.round(20 * scale)}px;opacity:.75}
  .mark{margin-top:${Math.round(20 * scale)}px;width:${Math.round(44 * scale)}px;height:${Math.max(3, Math.round(4 * scale))}px;border-radius:2px;background:#FFF8EE;opacity:.9}
  </style></head><body>
  <div class="art"></div><div class="scrim"></div>
  ${audio ? '<div class="label">Аудиокнига</div>' : ''}
  <div class="bottom">
    <div class="author">${esc(item.author)}</div>
    <div class="title">${esc(item.title)}</div>
    ${item.subtitle && !audio ? `<div class="sub">${esc(item.subtitle)}</div>` : ''}
    <div class="mark"></div>
  </div></body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(join(publicDir, 'store/covers'), { recursive: true });
mkdirSync(join(publicDir, 'icons'), { recursive: true });

for (const item of catalog.items) {
  const [w, h] = item.kind === 'audiobook' ? [900, 900] : [720, 1080];
  await page.setViewportSize({ width: w, height: h });
  // Load from a file next to the fonts so the relative @font-face URLs resolve.
  const tmp = join(fontsDir, '_cover.html');
  writeFileSync(tmp, coverHtml(item, w, h));
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(publicDir, `store/covers/${item.id}.jpg`), type: 'jpeg', quality: 82 });
  console.log('cover', item.id);
}

// Icons, cut from the artwork: `tile` keeps the rounded tile with transparent corners (browsers, Android "any"),
// `square` crops inside the rounded corners (Apple touch icon — iOS rounds it itself), `maskable` centres the tile
// on a blurred copy of itself so Android's circle/squircle masks never cut the name.
const TILE = { x: 0.047, y: 0.049, w: 0.906, h: 0.902 }; // the tile inside the artwork's dark margin
if (iconSource) {
  const src = `data:image/png;base64,${readFileSync(iconSource).toString('base64')}`;
  for (const [name, size, mode] of [
    ['icon-192.png', 192, 'tile'], ['icon-512.png', 512, 'tile'], ['maskable-512.png', 512, 'maskable'],
    ['apple-touch-icon.png', 180, 'square'], ['favicon-64.png', 64, 'tile'],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent('<body style="margin:0;background:transparent"><canvas></canvas></body>');
    const png = await page.evaluate(async ({ src, size, mode, TILE }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const W = img.naturalWidth, H = img.naturalHeight;
      const t = { x: TILE.x * W, y: TILE.y * H, w: TILE.w * W, h: TILE.h * H };
      const c = document.querySelector('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      if (mode === 'tile') {
        g.beginPath();
        g.roundRect(0, 0, size, size, size * 0.225);
        g.clip();
        g.drawImage(img, t.x, t.y, t.w, t.h, 0, 0, size, size);
      } else if (mode === 'square') {
        const d = 0.07; // inside the rounded corners
        g.drawImage(img, t.x + t.w * d, t.y + t.h * d, t.w * (1 - 2 * d), t.h * (1 - 2 * d), 0, 0, size, size);
      } else {
        g.filter = 'blur(18px) brightness(.85)';
        g.drawImage(img, t.x, t.y, t.w, t.h, -size * 0.1, -size * 0.1, size * 1.2, size * 1.2);
        g.filter = 'none';
        const s = size * 0.84, o = (size - s) / 2;
        g.save();
        g.beginPath();
        g.roundRect(o, o, s, s, s * 0.18);
        g.clip();
        g.drawImage(img, t.x, t.y, t.w, t.h, o, o, s, s);
        g.restore();
      }
      return c.toDataURL('image/png').split(',')[1];
    }, { src, size, mode, TILE });
    writeFileSync(join(publicDir, 'icons', name), Buffer.from(png, 'base64'));
    console.log('icon', name);
  }
}
await browser.close();

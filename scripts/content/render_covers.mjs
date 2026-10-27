// Render store covers (public-domain paintings with the title set in Golos Text) and the PWA icons.
// Usage: node render_covers.mjs <catalog.source.json> <out-public-dir> <fonts-dir> <art-dir> [<icon-source.png>]
// <fonts-dir> holds the Golos Text woff2 files and a local.css with their @font-face rules (Google Fonts, SIL OFL).
// <icon-source.png> is the square app-icon artwork (a rounded tile on a dark ground); every icon size is cut from it.
// <art-dir>/<repo>/images/cover.jpg is the cover painting of a Standard Ebooks source repository — the
// paintings are in the public domain, Standard Ebooks' crops are CC0 (see README). Requires CHROMIUM_PATH.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [catalogPath, publicDir, fontsDir, artDir, iconSource] = process.argv.slice(2);
const fontFaces = readFileSync(join(fontsDir, 'local.css'), 'utf8');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function coverHtml(item, w, h) {
  const audio = item.kind === 'audiobook';
  const file = join(artDir, item.cover.art, 'images/cover.jpg');
  // A missing painting would render as a plain black cover without any error.
  if (!existsSync(file)) throw new Error(`${item.id}: no painting at ${file}`);
  const art = pathToFileURL(file).href;
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

// Icons, cut from the artwork: `tile` re-rounds the tile a little tighter than the painted corners, with transparent
// corners (browsers, Android "any"); `square` is the tile edge to edge (Apple touch icon — iOS's own, larger corner
// radius hides the painted corners); `maskable` centres the tile on a blurred copy of itself so Android's circle or
// squircle masks never cut the name.
const TILE = { x: 48 / 1024, y: 53 / 1024, w: 922 / 1024, h: 914 / 1024 }; // the tile inside the artwork's dark margin
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
        g.roundRect(0, 0, size, size, size * 0.2);
        g.clip();
        g.drawImage(img, t.x, t.y, t.w, t.h, 0, 0, size, size);
      } else if (mode === 'square') {
        g.drawImage(img, t.x, t.y, t.w, t.h, 0, 0, size, size);
      } else {
        g.filter = 'blur(18px) brightness(.85)';
        g.drawImage(img, t.x, t.y, t.w, t.h, -size * 0.1, -size * 0.1, size * 1.2, size * 1.2);
        g.filter = 'none';
        const s = size * 0.88, o = (size - s) / 2;
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
// Link preview (Open Graph, 1200 × 630): the icon tile, the name and a strip of store covers.
if (iconSource) {
  const tile = await page.evaluate(async ({ src, TILE }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = c.height = 900;
    const g = c.getContext('2d');
    g.beginPath();
    g.roundRect(0, 0, 900, 900, 180);
    g.clip();
    g.drawImage(img, TILE.x * img.naturalWidth, TILE.y * img.naturalHeight, TILE.w * img.naturalWidth, TILE.h * img.naturalHeight, 0, 0, 900, 900);
    return c.toDataURL('image/png');
  }, { src: `data:image/png;base64,${readFileSync(iconSource).toString('base64')}`, TILE });
  const covers = ['pikovaya-dama', 'anna-karenina', 'chernyi-monah', 'otcy-i-deti', 'prestuplenie-i-nakazanie']
    .map((id) => pathToFileURL(join(publicDir, `store/covers/${id}.jpg`)).href);
  await page.setViewportSize({ width: 1200, height: 630 });
  const tmp = join(fontsDir, '_og.html');
  writeFileSync(tmp, `<!doctype html><html><head><meta charset="utf-8"><style>${fontFaces}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;overflow:hidden;font-family:'Golos Text';color:#FFF6EA;
    background:radial-gradient(90% 120% at 18% 30%, #3A2A1E 0%, #1A1310 55%, #100C0A 100%)}
  .icon{position:absolute;left:70px;top:95px;width:440px;height:440px;border-radius:88px;box-shadow:0 30px 60px -20px rgba(0,0,0,.8)}
  .txt{position:absolute;left:570px;top:118px;right:60px}
  h1{font-weight:800;font-size:112px;line-height:1;letter-spacing:-.03em}
  p{margin-top:18px;font-weight:500;font-size:34px;line-height:1.25;opacity:.86}
  .fmt{margin-top:12px;font-weight:600;font-size:24px;letter-spacing:.06em;opacity:.55}
  .row{position:absolute;left:570px;bottom:70px;display:flex;gap:14px}
  .row img{width:92px;height:138px;object-fit:cover;border-radius:8px;box-shadow:0 12px 24px -10px rgba(0,0,0,.8)}
  </style></head><body><img class="icon" src="${tile}"><div class="txt"><h1>Boowie</h1><p>Книги и аудиокниги —<br>в телефоне, без интернета</p><div class="fmt">PDF · FB2 · EPUB · MP3 · M4B</div></div>
  <div class="row">${covers.map((u) => `<img src="${u}">`).join('')}</div></body></html>`);
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: join(publicDir, 'og.jpg'), type: 'jpeg', quality: 86 });
  console.log('og image');
}
await browser.close();

// Render typographic "cold titanium" covers and PWA icons with headless Chromium.
// Usage: node render_covers.mjs <catalog.source.json> <out-public-dir> <fonts-dir>
// <fonts-dir> holds Old Standard TT + Martian Mono woff2 files and a local.css with their @font-face rules
// (downloaded from Google Fonts). Requires a Chromium binary (CHROMIUM_PATH).
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [catalogPath, publicDir, fontsDir] = process.argv.slice(2);
const fontFaces = readFileSync(join(fontsDir, 'local.css'), 'utf8');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const TINTS = {
  graphite: ['#3A3F47', '#1B1E23', 'dark'],
  obsidian: ['#24272D', '#0A0B0D', 'dark'],
  steel: ['#71879A', '#2F3C48', 'dark'],
  ink: ['#3A4D62', '#121922', 'dark'],
  slate: ['#66766F', '#28302D', 'dark'],
  oxide: ['#80605A', '#33231F', 'dark'],
  titanium: ['#E1E4E8', '#A7AEB7', 'light'],
  bone: ['#F0EEE9', '#C6C2B9', 'light'],
  sand: ['#DDD5C7', '#A69B89', 'light'],
};

const s = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const MOTIFS = {
  spade: () => s('M200 70 C 150 140, 95 175, 95 225 C 95 265, 130 285, 160 280 C 178 277, 190 266, 196 255 C 192 290, 180 315, 160 330 L 240 330 C 220 315, 208 290, 204 255 C 210 266, 222 277, 240 280 C 270 285, 305 265, 305 225 C 305 175, 250 140, 200 70 Z') + '<line x1="60" y1="360" x2="340" y2="360"/>',
  waves: () => [0, 1, 2, 3, 4].map((i) => s(`M40 ${150 + i * 34} C 90 ${125 + i * 34}, 130 ${175 + i * 34}, 200 ${150 + i * 34} S 310 ${125 + i * 34}, 360 ${150 + i * 34}`, `opacity="${1 - i * 0.16}"`)).join(''),
  target: () => [150, 110, 70, 30].map((r) => `<circle cx="200" cy="200" r="${r}"/>`).join('') + '<line x1="200" y1="20" x2="200" y2="380"/><line x1="20" y1="200" x2="380" y2="200"/>',
  eye: () => s('M40 200 Q 200 70 360 200 Q 200 330 40 200 Z') + '<circle cx="200" cy="200" r="58"/><circle cx="200" cy="200" r="18" fill="currentColor"/>',
  monolith: () => '<rect x="150" y="70" width="100" height="270" rx="50"/><circle cx="200" cy="130" r="22"/><line x1="70" y1="340" x2="330" y2="340"/>',
  bars: () => [120, 200, 160, 240, 90].map((h, i) => `<rect x="${78 + i * 52}" y="${330 - h}" width="28" height="${h}" rx="3"/>`).join(''),
  snow: () => {
    let out = '';
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 70; i++) out += `<circle cx="${40 + rnd() * 320}" cy="${40 + rnd() * 320}" r="${1.5 + rnd() * 3}" fill="currentColor" stroke="none" opacity="${0.35 + rnd() * 0.6}"/>`;
    return out + '<line x1="40" y1="330" x2="360" y2="300"/>';
  },
  rails: () => s('M110 380 L 196 60') + s('M290 380 L 204 60') + [0, 1, 2, 3, 4, 5, 6].map((i) => { const y = 370 - i * i * 6.4 - i * 8; const w = 95 - (370 - y) * 0.28; return `<line x1="${200 - w}" y1="${y}" x2="${200 + w}" y2="${y}"/>`; }).join(''),
  slash: () => '<circle cx="200" cy="200" r="120"/><line x1="90" y1="340" x2="310" y2="60"/>',
  pair: () => '<circle cx="160" cy="200" r="100"/><circle cx="240" cy="200" r="100"/>',
  horizon: () => [0, 1, 2, 3, 4].map((i) => `<line x1="40" y1="${250 + i * 22}" x2="360" y2="${250 + i * 22}" opacity="${1 - i * 0.17}"/>`).join('') + s('M110 250 A 90 90 0 0 1 290 250'),
  polygons: () => '<polygon points="80,250 125,172 170,250"/><rect x="190" y="180" width="70" height="70"/><polygon points="300,170 335,195 322,240 278,240 265,195"/><polygon points="120,320 150,302 180,320 180,350 150,368 120,350"/><line x1="40" y1="290" x2="360" y2="290" opacity="0.5"/>',
  clock: () => '<circle cx="200" cy="200" r="140"/><circle cx="200" cy="200" r="104" opacity="0.6"/>' + Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<line x1="${200 + Math.cos(a) * 118}" y1="${200 + Math.sin(a) * 118}" x2="${200 + Math.cos(a) * 132}" y2="${200 + Math.sin(a) * 132}"/>`; }).join('') + '<line x1="200" y1="200" x2="200" y2="120"/><line x1="200" y1="200" x2="262" y2="232"/>',
  tripod: () => s('M140 150 A 60 40 0 0 1 260 150 Z') + '<line x1="160" y1="150" x2="90" y2="350"/><line x1="200" y1="150" x2="200" y2="360"/><line x1="240" y1="150" x2="310" y2="350"/><circle cx="200" cy="128" r="8" fill="currentColor"/>',
  lightning: () => '<polygon points="200,50 290,160 200,270 110,160"/>' + s('M200 270 L 185 300 L 215 310 L 195 370'),
  circle: () => '<circle cx="200" cy="200" r="130"/><circle cx="200" cy="200" r="6" fill="currentColor"/>',
  leaf: () => [0, 1, 2].map((i) => s(`M${110 + i * 90} 340 C ${60 + i * 90} 250, ${100 + i * 90} 140, ${150 + i * 90} 80 C ${170 + i * 90} 160, ${160 + i * 90} 260, ${110 + i * 90} 340 Z`) + s(`M${110 + i * 90} 340 C ${120 + i * 90} 250, ${130 + i * 90} 170, ${150 + i * 90} 80`, 'opacity="0.6"')).join(''),
  stack: () => [260, 220, 180, 140, 100].map((w, i) => `<rect x="${200 - w / 2}" y="${100 + i * 46}" width="${w}" height="26" rx="4"/>`).join(''),
};

const FORMAT_LABEL = {
  epub: 'EPUB', fb2: 'FB2', 'fb2.zip': 'FB2 · ZIP', 'fb2-cp1251': 'FB2', pdf: 'PDF', 'pdf-no-outline': 'PDF',
  m4b: 'M4B', 'mp3-multi': 'MP3', 'mp3-chapters': 'MP3', 'mp3-single': 'MP3',
};

function coverHtml(item, w, h) {
  const [c1, c2, tone] = TINTS[item.cover.tint];
  const fg = tone === 'dark' ? '#ECEFF4' : '#0F1115';
  const fg2 = tone === 'dark' ? 'rgba(236,239,244,0.62)' : 'rgba(15,17,21,0.58)';
  const line = tone === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(15,17,21,0.14)';
  const audio = item.kind === 'audiobook';
  const titleSize = item.title.length > 24 ? 50 : item.title.length > 14 ? 62 : 76;
  const motifSize = audio ? 300 : 330;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${fontFaces}
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${w}px;height:${h}px;overflow:hidden;font-family:'Old Standard TT',serif;color:${fg};
    background:
      radial-gradient(120% 80% at 18% 0%, rgba(255,255,255,${tone === 'dark' ? 0.10 : 0.45}) 0%, transparent 55%),
      repeating-linear-gradient(90deg, rgba(255,255,255,${tone === 'dark' ? 0.022 : 0.10}) 0 1px, transparent 1px 3px),
      repeating-linear-gradient(90deg, rgba(0,0,0,${tone === 'dark' ? 0.05 : 0.025}) 0 1px, transparent 1px 7px),
      linear-gradient(165deg, ${c1} 0%, ${c2} 100%);}
  .frame{position:absolute;inset:26px;border:1px solid ${line};border-radius:6px}
  .top{position:absolute;top:52px;left:56px;right:56px;display:flex;justify-content:space-between;align-items:baseline;
    font-style:italic;font-size:25px;color:${fg2}}
  .top .y{font-family:'Martian Mono';font-style:normal;font-size:14px;letter-spacing:0}
  .motif{position:absolute;left:50%;top:${audio ? 44 : 41}%;width:${motifSize}px;height:${motifSize}px;transform:translate(-50%,-50%);color:${fg}}
  .motif svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;opacity:.78}
  .bottom{position:absolute;left:56px;right:56px;bottom:56px}
  .title{font-weight:400;font-size:${titleSize}px;line-height:1.0;letter-spacing:-0.005em}
  .sub{margin-top:12px;font-style:italic;font-size:22px;color:${fg2}}
  .meta{margin-top:26px;padding-top:14px;border-top:1px solid ${line};display:flex;justify-content:space-between;
    font-family:'Martian Mono';font-size:13px;letter-spacing:.02em;text-transform:uppercase;color:${fg2}}
  </style></head><body>
  <div class="frame"></div>
  <div class="top"><span>${item.author}</span><span class="y">${item.year > 1000 ? item.year : ''}</span></div>
  <div class="motif"><svg viewBox="0 0 400 400">${MOTIFS[item.cover.motif]()}</svg></div>
  <div class="bottom">
    <div class="title">${item.title}</div>
    ${item.subtitle ? `<div class="sub">${item.subtitle}</div>` : ''}
    <div class="meta"><span>${audio ? 'Аудиокнига' : item.language === 'en' ? 'English edition' : 'Книга'}</span><span>${FORMAT_LABEL[item.format]} · № ${String(item.rank).padStart(3, '0')}</span></div>
  </div></body></html>`;
}

function iconHtml(size, maskable) {
  const pad = maskable ? size * 0.2 : size * 0.12;
  const inner = size - pad * 2;
  return `<!doctype html><html><head><style>
  *{margin:0;padding:0}
  body{width:${size}px;height:${size}px;overflow:hidden;background:${maskable ? '#16181C' : 'transparent'}}
  .tile{position:absolute;inset:0;border-radius:${maskable ? 0 : size * 0.225}px;
    background:
      radial-gradient(110% 70% at 20% 0%, rgba(255,255,255,0.16) 0%, transparent 60%),
      repeating-linear-gradient(90deg, rgba(255,255,255,0.03) 0 1px, transparent 1px 3px),
      linear-gradient(165deg, #2B2F36 0%, #0E0F12 100%);
    box-shadow: inset 0 ${size * 0.006}px 0 rgba(255,255,255,0.22)}
  svg{position:absolute;left:${pad}px;top:${pad}px;width:${inner}px;height:${inner}px}
  </style></head><body><div class="tile"></div>
  <svg viewBox="0 0 100 100"><defs>
    <linearGradient id="chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F4F6F9"/><stop offset="0.55" stop-color="#C3C9D2"/><stop offset="1" stop-color="#8E96A4"/></linearGradient></defs>
    <path d="M22 24 C 34 20, 44 22, 50 28 C 56 22, 66 20, 78 24 L 78 74 C 66 70, 56 72, 50 78 C 44 72, 34 70, 22 74 Z" fill="none" stroke="url(#chrome)" stroke-width="4.2" stroke-linejoin="round"/>
    <line x1="50" y1="28" x2="50" y2="78" stroke="url(#chrome)" stroke-width="3.2"/>
    ${[0, 1, 2, 3, 4].map((i) => `<line x1="${60 + i * 3.6}" y1="${50 - [4, 9, 13, 7, 3][i]}" x2="${60 + i * 3.6}" y2="${50 + [4, 9, 13, 7, 3][i]}" stroke="#7B93A8" stroke-width="2" stroke-linecap="round"/>`).join('')}
  </svg></body></html>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ deviceScaleFactor: 1 });
mkdirSync(join(publicDir, 'store/covers'), { recursive: true });
mkdirSync(join(publicDir, 'icons'), { recursive: true });

for (const item of catalog.items) {
  const [w, h] = item.kind === 'audiobook' ? [800, 800] : [600, 900];
  await page.setViewportSize({ width: w, height: h });
  // Load from a file next to the fonts so the relative @font-face URLs resolve.
  const tmp = join(fontsDir, '_cover.html');
  writeFileSync(tmp, coverHtml(item, w, h));
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(publicDir, `store/covers/${item.id}.jpg`), type: 'jpeg', quality: 86 });
  console.log('cover', item.id);
}

for (const [name, size, maskable] of [
  ['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true], ['favicon-64.png', 64, false],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(iconHtml(size, maskable));
  await page.screenshot({ path: join(publicDir, 'icons', name), type: 'png', omitBackground: !maskable });
  console.log('icon', name);
}
await browser.close();

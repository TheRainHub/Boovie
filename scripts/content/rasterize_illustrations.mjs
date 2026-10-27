// Usage: node rasterize_illustrations.mjs <out-dir> <standard-ebooks-repo>...
// Some Standard Ebooks sources carry their illustrations as large traced SVGs (Tenniel's «Alice» is 68 MB). This
// renders every illustration SVG over 400 KB to a JPEG 760 px wide in <out-dir>/<repo>/<name>.jpg;
// build_books.py swaps those in. Requires CHROMIUM_PATH.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [outDir, ...repos] = process.argv.slice(2);
const LIMIT = 400 * 1024;
const WIDTH = 760;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
for (const repo of repos) {
  const images = join(repo, 'src/epub/images');
  const big = readdirSync(images).filter((f) => f.endsWith('.svg') && !/^(cover|titlepage|logo)\.svg$/.test(f) && statSync(join(images, f)).size > LIMIT);
  if (!big.length) continue;
  const dir = join(outDir, basename(repo));
  mkdirSync(dir, { recursive: true });
  for (const f of big) {
    // Open the SVG itself as the page (a blank page may not load local files), sized to its viewBox.
    const svg = readFileSync(join(images, f), 'utf8').slice(0, 2000);
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    const ratio = vb ? Number(vb[2]) / Number(vb[1]) : 1.4;
    await page.setViewportSize({ width: WIDTH, height: Math.round(WIDTH * ratio) });
    await page.goto(pathToFileURL(join(images, f)).href);
    const data = await page.screenshot({ type: 'jpeg', quality: 72 });
    const out = join(dir, f.replace(/\.svg$/, '.jpg'));
    writeFileSync(out, data);
    console.log(`${basename(repo)}/${f} → ${(statSync(out).size / 1024).toFixed(0)} KB`);
  }
}
await browser.close();

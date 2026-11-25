// Sharing a passage as a picture: a phrase selected in the reader (or widened to its paragraph) opens the repost
// sheet; its preview comes in four looks and three shapes at their real sizes; «Сохранить» saves the PNG to the
// device; nothing is written to the book or sent anywhere; the choice of look and shape is remembered; a saved
// quote can be shared the same way.
import { readFileSync } from 'node:fs';
import { BASE, browser, checks } from './harness.mjs';

const { check, log, done } = checks('repost');
const b = await browser();
const ctx = await b.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const dlg = () => page.getByRole('dialog');

await page.goto(BASE + '/store/');
await page.getByRole('tab', { name: 'Электронные', exact: true }).click();
await page.getByLabel('Поиск по каталогу').fill('Пиковая дама');
await page.locator('main button', { hasText: 'Пиковая дама' }).first().click();
await dlg().getByRole('button', { name: 'Скачать в библиотеку' }).click();
await dlg().getByRole('button', { name: 'Читать', exact: true }).click({ timeout: 60000 });
await page.locator('.book-content').first().waitFor({ timeout: 20000 });
await page.waitForTimeout(3600);
for (let i = 0; i < 2; i++) { await page.mouse.click(400, 520); await page.waitForTimeout(900); }

// From here on: what the page writes and sends.
const posts = [];
page.on('request', (r) => r.method() !== 'GET' && posts.push(`${r.method()} ${r.url()}`));
const quotesStored = () => page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('titan-library'); q.onsuccess = () => r(q.result); });
  const all = await new Promise((r) => { const q = db.transaction('progress').objectStore('progress').getAll(); q.onsuccess = () => r(q.result); });
  return all.flatMap((p) => p.bookmarks).length;
});
const marksBefore = await quotesStored();

// A phrase in the middle of a paragraph.
const picked = await page.evaluate(() => {
  const vw = window.innerWidth;
  for (const p of document.querySelector('.book-content').querySelectorAll('p')) {
    const r = p.getBoundingClientRect();
    if (r.left < 0 || r.right > vw || r.top < 120 || (p.textContent ?? '').length < 160) continue;
    const node = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
    const words = node ? [...node.data.matchAll(/\S+/g)] : [];
    if (words.length < 12) continue;
    const range = document.createRange();
    range.setStart(node, words[2].index);
    range.setEnd(node, words[7].index + words[7][0].length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return { phrase: range.toString(), paragraph: p.textContent.trim() };
  }
  return null;
});
log('phrase:', picked?.phrase);
const bar = page.getByRole('toolbar', { name: 'Цитата' });
await bar.waitFor({ timeout: 4000 }).catch(() => undefined);
check(!!picked && (await bar.isVisible()), 'a phrase selected: the bar offers to share it');
check(await bar.getByRole('button', { name: 'Абзац' }).isVisible(), 'and to widen it to its paragraph');

await bar.getByRole('button', { name: 'Абзац' }).click();
await page.waitForTimeout(600);
const widened = await page.evaluate(() => getSelection().toString().replace(/\s+/g, ' ').trim());
check(widened === picked.paragraph.replace(/\s+/g, ' ').trim(), `«Абзац» selects the whole paragraph (${widened.length} characters)`);
check(!(await bar.getByRole('button', { name: 'Абзац' }).isVisible().catch(() => false)), 'and then the button goes');

// The repost sheet.
await bar.getByRole('button', { name: 'Поделиться' }).click();
const sheet = dlg();
await sheet.waitFor();
const preview = sheet.locator('img[data-repost-preview]');
const shown = async (want) => {
  await sheet.locator(`img[data-repost-preview="${want}"]`).waitFor({ timeout: 10000 }).catch(() => undefined);
  return sheet.locator('img').first().evaluate((img) => `${img.naturalWidth}x${img.naturalHeight}`).catch(() => 'none');
};
check(/Поделиться цитатой/.test(await sheet.innerText()) && !(await bar.isVisible().catch(() => false)), 'the repost sheet opens (the bar steps aside)');
check(await shown('1080x1920') === '1080x1920', 'the story: 1080 × 1920');
if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/repost-sheet.png` });
await sheet.getByRole('tab', { name: 'Пост' }).click();
check(await shown('1080x1350') === '1080x1350', 'the post: 1080 × 1350');
await sheet.getByRole('tab', { name: 'Квадрат' }).click();
check(await shown('1080x1080') === '1080x1080', 'the square: 1080 × 1080');

const looks = new Set();
for (const style of ['cover', 'paper', 'night', 'photo']) {
  await sheet.locator(`[data-style="${style}"]`).click();
  await page.waitForTimeout(150);
  await shown('1080x1080');
  // The picture's colour at its middle-top: each look has its own ground.
  looks.add(await preview.evaluate((img) => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 8;
    const x = c.getContext('2d');
    x.drawImage(img, img.naturalWidth * 0.8, 40, 40, 40, 0, 0, 8, 8);
    return [...x.getImageData(4, 4, 1, 1).data.slice(0, 3)].map((v) => Math.round(v / 16)).join(',');
  }));
  check(await sheet.locator(`[data-style="${style}"]`).getAttribute('aria-checked') === 'true', `the «${style}» look is chosen`);
}
check(looks.size === 4, `four looks, four different grounds (${[...looks].join(' | ')})`);

// Save to the device.
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), sheet.getByRole('button', { name: 'Сохранить' }).click()]);
if (download) {
  const path = await download.path();
  const png = readFileSync(path);
  log('saved as', download.suggestedFilename());
  check(png.readUInt32BE(16) === 1080 && png.readUInt32BE(20) === 1080 && /^boowie-.+-square\.png$/.test(download.suggestedFilename()), '«Сохранить» saves the PNG on the device, at its size');
} else check(false, '«Сохранить» saves the PNG on the device');
await page.waitForTimeout(400);
check(await page.getByText('Картинка сохранена на устройство').count() > 0, 'and says so');

check(await quotesStored() === marksBefore, 'nothing was written to the book (no quote, no bookmark)');
check(posts.length === 0, `nothing was sent anywhere${posts.length ? ': ' + posts.join(', ') : ''}`);

// Remembered: the next passage opens as a square in the night look.
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const again = await page.evaluate(() => {
  const p = [...document.querySelector('.book-content').querySelectorAll('p')].find((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && x.textContent.length > 80; });
  const node = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
  const r = document.createRange();
  r.setStart(node, 0);
  r.setEnd(node, Math.min(60, node.data.length));
  getSelection().removeAllRanges();
  getSelection().addRange(r);
  return r.toString();
});
await bar.waitFor({ timeout: 4000 }).catch(() => undefined);
await bar.getByRole('button', { name: 'Поделиться' }).click();
await sheet.waitFor();
check(await shown('1080x1080') === '1080x1080' && await sheet.locator('[data-style="photo"]').getAttribute('aria-checked') === 'true', 'the look and shape are remembered');
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
void again;

// A saved quote shares the same way.
await page.evaluate(() => {
  const p = [...document.querySelector('.book-content').querySelectorAll('p')].find((x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top > 200 && x.textContent.length > 80; });
  const node = document.createTreeWalker(p, NodeFilter.SHOW_TEXT).nextNode();
  const r = document.createRange();
  r.setStart(node, 0);
  r.setEnd(node, Math.min(50, node.data.length));
  getSelection().removeAllRanges();
  getSelection().addRange(r);
});
await bar.waitFor({ timeout: 4000 }).catch(() => undefined);
await bar.getByRole('button', { name: 'Сохранить цитату' }).click();
await page.waitForTimeout(700);
const spot = await page.evaluate(() => {
  for (const m of document.querySelector('.book-content').querySelectorAll('mark.quote-mark')) {
    for (const r of m.getClientRects()) {
      const l = Math.max(r.left, innerWidth * 0.28), rr = Math.min(r.right, innerWidth * 0.72);
      if (rr - l > 6) return { x: (l + rr) / 2, y: r.top + r.height / 2 };
    }
  }
  return null;
});
if (spot) await page.mouse.click(spot.x, spot.y);
await page.waitForTimeout(600);
await dlg().getByRole('button', { name: 'Поделиться картинкой' }).click().catch(() => undefined);
await page.waitForTimeout(600);
check(/Поделиться цитатой/.test(await dlg().innerText().catch(() => '')), 'a saved quote opens the same repost sheet');

check(!errors.length, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
await b.close();
process.exitCode = done();

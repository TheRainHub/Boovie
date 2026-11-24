// The guide to putting the site on a phone's home screen: a card on the home screen of a phone's browser (not on a
// computer, not once installed), the steps for iPhone and for Android, Chrome's one-tap install, the cross that puts
// the card away for a month, and the entry in the settings.
import { devices } from 'playwright-core';
import { BASE, browser, checks } from './harness.mjs';

const { check, log, done } = checks('install guide');
const b = await browser();

const open = async (device, path = '/', { standalone = false, locale = 'ru-RU' } = {}) => {
  const ctx = await b.newContext({ ...device, locale });
  await ctx.addInitScript((standalone) => {
    if (!standalone) return;
    const mm = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/display-mode: standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q));
  }, standalone);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(600);
  return { ctx, page, errors, card: page.locator('[data-install-card]') };
};

// iPhone: the card, the guide's steps, the cross.
{
  const { ctx, page, card, errors } = await open(devices['iPhone 14']);
  check(await card.isVisible(), 'iPhone: the home screen offers the app');
  log(await card.innerText());
  await card.getByRole('button', { name: 'Как это сделать' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.waitFor();
  await page.waitForTimeout(400);
  const text = await sheet.innerText();
  check(await sheet.locator('[data-steps="ios"]').count() === 1 && /Поделиться/.test(text) && /На экран „Домой“/.test(text), 'iPhone: the guide shows the Share → Add to Home Screen steps');
  check(/отдельно от Safari/.test(await sheet.locator('[data-storage-note]').innerText()), 'iPhone: it says the app keeps its books apart from Safari');
  await sheet.getByRole('tab', { name: 'Android' }).click();
  check(await sheet.locator('[data-steps="android"]').count() === 1, 'the other phone\'s steps are a tap away');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await card.getByRole('button', { name: 'Скрыть' }).click();
  check(!(await card.isVisible()), 'the cross puts the card away');
  await page.reload();
  await page.waitForTimeout(800);
  check(!(await card.isVisible()), 'and it stays away');
  check(!errors.length, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`);
  await ctx.close();
}

// Android: Chrome's own offer becomes a one-tap install.
{
  const { ctx, page, card } = await open(devices['Pixel 7']);
  check(await card.isVisible() && /Как это сделать/.test(await card.innerText()), 'Android: the card shows how, before the browser offers to install');
  await page.evaluate(() => {
    window.__prompted = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = async () => { window.__prompted++; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await page.waitForTimeout(300);
  const install = card.getByRole('button', { name: 'Установить' });
  check(await install.isVisible(), 'Android: with the browser\'s offer, the card installs in one tap');
  await install.click();
  await page.waitForTimeout(400);
  check(await page.evaluate(() => window.__prompted) === 1 && !(await card.isVisible()), 'the browser\'s dialog opens, and once installed the card goes');
  await ctx.close();
}

// A computer, an installed app: no card.
{
  const desk = await open(devices['Desktop Chrome']);
  check(!(await desk.card.isVisible()), 'a computer: no card');
  await desk.ctx.close();
  const installed = await open(devices['iPhone 14'], '/', { standalone: true });
  check(!(await installed.card.isVisible()), 'opened from the home screen: no card');
  await installed.page.goto(BASE + '/settings/');
  await installed.page.waitForTimeout(600);
  check(/уже открыт как приложение/.test(await installed.page.locator('main').innerText()), 'and the settings say it is installed');
  await installed.ctx.close();
}

// The settings: the guide any time; and in English.
{
  const { ctx, page } = await open(devices['Pixel 7'], '/settings/');
  await page.getByRole('button', { name: 'Как это сделать' }).click();
  await page.getByRole('dialog').waitFor();
  check(await page.getByRole('dialog').locator('[data-steps="android"]').count() === 1, 'the settings open the guide (Android steps on Android)');
  await ctx.close();
  const enPhone = await open(devices['iPhone 14'], '/en/', { locale: 'en-US' });
  check(/Boowie as an app/.test(await enPhone.card.innerText().catch(() => '')), 'in English on the English site');
  await enPhone.ctx.close();
}

await b.close();
process.exitCode = done();

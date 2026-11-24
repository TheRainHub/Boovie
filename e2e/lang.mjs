// The site in the reader's language from the first paint: Russian at the root, English under /en/, chosen by the
// language picked in the settings or else the browser's; pages are prerendered in their language; a robot isn't
// moved; both sites share the library.
import { BASE, browser, checks } from './harness.mjs';

const { check, log, done } = checks('language');
const b = await browser();

const visit = async (locale, path, { ua, saved } = {}) => {
  const ctx = await b.newContext({ locale, userAgent: ua, viewport: { width: 430, height: 932 } });
  if (saved) await ctx.addInitScript((v) => localStorage.setItem('boowie-lang', v), saved);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Which documents were asked for, in order (the head script replaces the first before it shows).
  const docs = [];
  page.on('request', (r) => r.resourceType() === 'document' && docs.push(new URL(r.url()).pathname + new URL(r.url()).search));
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
  const url = new URL(page.url());
  const lang = await page.evaluate(() => document.documentElement.lang);
  const nav = await page.locator('nav[aria-label]').first().innerText().catch(() => '');
  return { ctx, page, errors, docs, at: url.pathname + url.search + url.hash, lang, nav: nav.replace(/\s+/g, ' ') };
};

// The prerendered pages themselves.
for (const [path, want, title] of [['/', 'ru', 'книги и аудиокниги'], ['/en/', 'en', 'books and audiobooks'], ['/en/library/', 'en', 'books and audiobooks']]) {
  const html = await (await fetch(BASE + path)).text();
  check(html.includes(`<html lang="${want}"`) && html.includes(title), `${path} is prerendered in ${want === 'en' ? 'English' : 'Russian'}`);
}
const en = await (await fetch(`${BASE}/en/`)).text();
check(!/<nav[^>]*>[^]*?[А-Яа-яЁё][^]*?<\/nav>/.test(en), 'the English page has no Russian in its navigation');
const manifest = await (await fetch(`${BASE}/en/manifest.webmanifest`)).json();
check(manifest.lang === 'en' && manifest.start_url === './' && manifest.icons[0].src.startsWith('../icons/'), 'the English site has its own manifest, with the shared icons');
check((await fetch(`${BASE}/en/store/`)).ok, 'the English store page is there');

// Browser languages.
for (const [locale, want] of [['en-US', 'en'], ['de-DE', 'en'], ['ru-RU', 'ru'], ['uk-UA', 'ru'], ['kk-KZ', 'ru']]) {
  const v = await visit(locale, '/');
  log(`${locale}: ${v.docs.join(' → ')} | ${v.nav}`);
  check(v.lang === want && (want === 'en' ? v.at === '/en/' : v.at === '/'), `a ${locale} browser gets ${want === 'en' ? 'English' : 'Russian'} (${v.at})`);
  check(want === 'en' ? /Books/.test(v.nav) && !/[А-Яа-я]/.test(v.nav) : /Книги/.test(v.nav), `  and its navigation reads «${v.nav}»`);
  check(!v.errors.length, `  no page errors${v.errors.length ? ': ' + v.errors.join('; ') : ''}`);
  await v.ctx.close();
}

// The page, its query and its anchor go along.
{
  const v = await visit('en-US', '/store/?item=time-machine#x');
  check(v.at === '/en/store/?item=time-machine#x', `the same page, query and anchor (${v.at})`);
  await v.ctx.close();
}

// An English address opened on purpose stays English; a robot stays where it is.
{
  const v = await visit('ru-RU', '/en/library/');
  check(v.at === '/en/library/' && v.lang === 'en', 'an English address stays English for a Russian browser');
  await v.ctx.close();
  const bot = await visit('en-US', '/', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  check(bot.at === '/' && bot.lang === 'ru', 'a search robot is not moved');
  await bot.ctx.close();
}

// The choice in the settings wins over the browser, both ways.
{
  const v = await visit('ru-RU', '/settings/');
  check(v.at === '/settings/', 'a Russian browser opens the Russian settings');
  await v.page.getByRole('tab', { name: 'English' }).click();
  await v.page.waitForURL(/\/en\/settings\//, { timeout: 8000 }).catch(() => undefined);
  check(new URL(v.page.url()).pathname === '/en/settings/' && (await v.page.evaluate(() => document.documentElement.lang)) === 'en', 'switching to English opens the English settings');
  await v.page.goto(BASE + '/');
  await v.page.waitForLoadState('networkidle').catch(() => undefined);
  check(new URL(v.page.url()).pathname === '/en/', 'from then on the root opens in English');
  await v.page.goto(BASE + '/en/settings/');
  await v.page.getByRole('tab', { name: 'Русский' }).click();
  await v.page.waitForURL((u) => u.pathname === '/settings/', { timeout: 8000 }).catch(() => undefined);
  check(new URL(v.page.url()).pathname === '/settings/', 'switching back opens the Russian settings');
  await v.page.goto(BASE + '/en/');
  await v.page.waitForLoadState('networkidle').catch(() => undefined);
  check(new URL(v.page.url()).pathname === '/', 'and an English address now goes to Russian (the choice was made)');
  await v.ctx.close();
}

// One library for both: a book taken in Russian is on the English shelf.
{
  const v = await visit('ru-RU', '/store/');
  await v.page.getByRole('tab', { name: 'Электронные', exact: true }).click();
  await v.page.getByLabel('Поиск по каталогу').fill('Пиковая дама');
  await v.page.locator('main button', { hasText: 'Пиковая дама' }).first().click();
  await v.page.getByRole('dialog').getByRole('button', { name: 'Скачать в библиотеку' }).click();
  await v.page.getByRole('dialog').getByRole('button', { name: 'Читать', exact: true }).waitFor({ timeout: 60000 });
  await v.page.goto(BASE + '/en/library/');
  await v.page.locator('[data-format]').first().waitFor({ timeout: 10000 }).catch(() => undefined);
  const shelf = await v.page.locator('[data-format]').count();
  check(shelf >= 1 && (await v.page.evaluate(() => document.documentElement.lang)) === 'en', `the English library shows the book taken on the Russian site (${shelf})`);
  await v.ctx.close();
}

await b.close();
process.exitCode = done();

// Render the bundled PDF editions with headless Chromium.
//  - dyadya-vanya.pdf: with a document outline (bookmarks) built from headings
//  - flatland.pdf: deliberately WITHOUT an outline, to exercise the reader's heading-detection fallback
// Usage: node render_pdfs.mjs <works.json> <catalog.source.json> <public-dir> <scratch-dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const [worksPath, catalogPath, publicDir, scratch] = process.argv.slice(2);
const works = Object.fromEntries(JSON.parse(readFileSync(worksPath, 'utf8')).map((w) => [w.id, w]));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE_CSS = `
  @page { size: 148mm 210mm; margin: 16mm 14mm 18mm; }
  body { font-family: 'Liberation Serif', 'DejaVu Serif', serif; font-size: 11pt; line-height: 1.45; color: #111; }
  .cover { page-break-after: always; height: 166mm; display: flex; align-items: center; justify-content: center; }
  .cover img { max-height: 166mm; max-width: 100%; }
  h1 { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 22pt; letter-spacing: -0.01em; margin: 0 0 8mm; page-break-before: always; }
  h2 { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 18pt; margin: 0 0 6mm; page-break-before: always; }
  p { margin: 0; text-indent: 1.4em; text-align: justify; hyphens: auto; }
  .persons p { text-indent: 0; margin-bottom: 1.2mm; }
  .title-page { text-align: center; padding-top: 40mm; page-break-after: always; }
  .title-page .a { font-family: 'Inter'; letter-spacing: .18em; text-transform: uppercase; font-size: 10pt; color: #555; }
  .title-page .t { font-family: 'Inter'; font-weight: 600; font-size: 28pt; margin: 6mm 0 3mm; }
  .title-page .s { font-size: 11pt; color: #444; }
  img { max-width: 100%; }
`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage();
mkdirSync(join(publicDir, 'store/books'), { recursive: true });
mkdirSync(scratch, { recursive: true });

async function render(id, html, outline) {
  const tmp = join(scratch, `${id}.html`);
  writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => document.fonts.ready);
  const out = join(publicDir, `store/books/${id}.pdf`);
  await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true, outline, tagged: outline,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="width:100%;text-align:center;font:8pt Inter,sans-serif;color:#888"><span class="pageNumber"></span></div>' });
  console.log('pdf', out);
}

// Дядя Ваня — acts as <h1>, rendered with outline.
{
  const item = catalog.items.find((i) => i.id === 'dyadya-vanya');
  const w = works[item.work];
  const cover = pathToFileURL(join(publicDir, `store/covers/${item.id}.jpg`)).href;
  const body = w.chapters.map((c) => `<h1>${esc(c.title)}</h1><div class="${c.title === 'Действующие лица' ? 'persons' : ''}">${c.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}</div>`).join('\n');
  await render(item.id, `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(w.title)}</title><style>${BASE_CSS}</style></head><body>
    <div class="cover"><img src="${cover}"></div>
    <div class="title-page"><div class="a">${esc(w.author)}</div><div class="t">${esc(w.title)}</div><div class="s">${esc(w.subtitle ?? '')}</div></div>
    ${body}</body></html>`, true);
}

// Flatland — Standard Ebooks source, spine order, NO outline.
{
  const item = catalog.items.find((i) => i.id === 'flatland');
  const src = join(works[item.work].standardEbooks, 'src/epub');
  const opf = readFileSync(join(src, 'content.opf'), 'utf8');
  const hrefById = Object.fromEntries([...opf.matchAll(/<item href="([^"]+)" id="([^"]+)"/g)].map((m) => [m[2], m[1]]));
  const spine = [...opf.matchAll(/<itemref idref="([^"]+)"/g)].map((m) => hrefById[m[1]])
    .filter((h) => !/(titlepage|imprint|colophon|uncopyright|halftitlepage)/.test(h));
  let body = '';
  for (const href of spine) {
    const file = join(src, href);
    const x = readFileSync(file, 'utf8');
    let inner = x.slice(x.indexOf('>', x.indexOf('<body')) + 1, x.lastIndexOf('</body>'));
    inner = inner.replace(/src="([^"]+)"/g, (_, s) => `src="${pathToFileURL(join(dirname(file), s)).href}"`)
      // Cross-file links (endnotes.xhtml#note-1) become in-document anchors; anything else non-http is unlinked,
      // otherwise Chromium bakes absolute file:// URIs of the build machine into the PDF.
      .replace(/href="(?:[^"#]*\.xhtml)?#([^"]+)"/g, 'href="#$1"')
      .replace(/href="(?!https?:|#)[^"]*"/g, "")
      .replace(/<h[2-6]([^>]*)>/g, '<h2$1>').replace(/<\/h[2-6]>/g, '</h2>')
      .replace(/<(section|article)[^>]*>/g, '<div>').replace(/<\/(section|article)>/g, '</div>');
    body += inner;
  }
  const cover = pathToFileURL(join(publicDir, `store/covers/${item.id}.jpg`)).href;
  await render(item.id, `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Flatland</title><style>${BASE_CSS}
    h2 { font-size: 20pt; } blockquote { margin: 3mm 8mm; } figure { margin: 4mm 0; text-align: center; } figure img { max-height: 70mm; }
    hgroup p { text-indent: 0; font-style: italic; margin-bottom: 4mm; } .z3998-roman { }</style></head><body>
    <div class="cover"><img src="${cover}"></div>
    <div class="title-page"><div class="a">Edwin A. Abbott</div><div class="t">Flatland</div><div class="s">A Romance of Many Dimensions</div></div>
    ${body}</body></html>`, false);
}
await browser.close();

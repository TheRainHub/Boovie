/**
 * Parser integration tests against the real files shipped in public/store.
 * Run: npm test   (tsx + linkedom's DOMParser; pdf.js legacy build runs without a worker in Node)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { DOMParser as LinkedomParser } from "linkedom";

(globalThis as unknown as { DOMParser: unknown }).DOMParser = LinkedomParser;

const root = join(process.cwd(), "public/store");
const blobOf = (p: string, type = "") => new Blob([readFileSync(p)], { type });
let failures = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n    ${(e as Error).stack?.split("\n").slice(0, 4).join("\n    ")}`);
  }
}

async function main() {
  const { parseFb2 } = await import("../src/lib/parsers/fb2Parser");
  const { parseEpub } = await import("../src/lib/parsers/epubParser");
  const { parsePdf } = await import("../src/lib/parsers/pdfParser");
  const { parseAudio, autoChapters } = await import("../src/lib/parsers/audioParser");
  const { readAudioMetadata } = await import("../src/lib/parsers/audioMetadata");
  const { detectKind } = await import("../src/lib/parsers/index");
  const { naturalCompare, decodeXml } = await import("../src/lib/parsers/text");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  console.log("FB2");
  await test("utf-8, flat sections, cover + annotation", async () => {
    const b = await parseFb2(blobOf(join(root, "books/dama-s-sobachkoy.fb2")), "dama-s-sobachkoy.fb2");
    assert.equal(b.title, "Дама с собачкой");
    assert.equal(b.author, "Антон Чехов");
    assert.deepEqual(b.chapters.map((c) => c.title), ["Глава I", "Глава II", "Глава III", "Глава IV"]);
    assert.ok(b.cover && b.cover.size > 10_000, "cover extracted");
    assert.ok(b.annotation?.includes("Ялта"));
    assert.ok(b.chapters[0].html!.startsWith("<h2>Глава I</h2><p>Говорили"), b.chapters[0].html!.slice(0, 80));
  });
  await test("windows-1251 encoding detected", async () => {
    const bytes = readFileSync(join(root, "books/otcy-i-deti.fb2"));
    assert.equal(decodeXml(new Uint8Array(bytes)).encoding, "windows-1251");
    const b = await parseFb2(new Blob([bytes]), "otcy-i-deti.fb2");
    assert.equal(b.title, "Отцы и дети");
    assert.equal(b.chapters.length, 28);
    assert.ok(b.chapters[0].html!.includes("Что, Петр, не видать еще?"));
  });
  await test("fb2.zip with nested parts → 239 chapters with groups", async () => {
    const b = await parseFb2(blobOf(join(root, "books/anna-karenina.fb2.zip")), "anna-karenina.fb2.zip");
    assert.equal(b.chapters.length, 239);
    assert.equal(b.chapters[0].group, "Часть первая");
    assert.equal(b.chapters[238].group, "Часть восьмая");
    assert.ok(b.chapters[0].html!.includes("Мне отмщение"), "book epigraph prepended");
    assert.ok(b.chapters[0].html!.includes("<h2>Часть первая</h2>"), "part heading shown on first chapter");
  });
  await test("nested story with chapters inside a collection", async () => {
    const b = await parseFb2(blobOf(join(root, "books/povesti-belkina.fb2")), "povesti-belkina.fb2");
    assert.deepEqual(b.chapters.map((c) => [c.group ?? "", c.title]).slice(0, 4), [["", "От издателя"], ["Выстрел", "Глава I"], ["Выстрел", "Глава II"], ["", "Метель"]]);
  });
  await test("flat body without sections is split into parts", async () => {
    const paras = Array.from({ length: 400 }, (_, i) => `<p>Абзац ${i} ${"слово ".repeat(20)}</p>`).join("");
    const xml = `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Плоская</book-title></title-info></description><body>${paras}</body></FictionBook>`;
    const b = await parseFb2(new Blob([xml]), "flat.fb2");
    assert.ok(b.chapters.length >= 3, `got ${b.chapters.length}`);
    assert.match(b.chapters[1].title, /часть 2/);
  });

  console.log("EPUB");
  await test("generated EPUB 3: nav.xhtml nested TOC (parts → chapters)", async () => {
    const b = await parseEpub(blobOf(join(root, "books/prestuplenie-i-nakazanie.epub")), "x.epub");
    assert.equal(b.title, "Преступление и наказание");
    const real = b.chapters.filter((c) => c.group);
    assert.equal(real.length, 41);
    assert.equal(real[0].group, "Часть первая");
    assert.equal(real.at(-1)!.group, "Эпилог");
    assert.ok(b.cover && b.cover.size > 10_000);
    const titlePage = b.chapters[0];
    assert.ok(titlePage.html!.includes('data-asset="OEBPS/images/cover.jpg"'), "relative image resolved to asset");
    assert.ok(b.assets.some((a) => a.key === "OEBPS/images/cover.jpg" && a.blob.size > 0));
  });
  await test("Standard Ebooks EPUB: TOC titles, sanitized markup", async () => {
    const b = await parseEpub(blobOf(join(root, "books/time-machine.epub")), "tm.epub");
    assert.equal(b.title, "The Time Machine");
    assert.equal(b.author, "H. G. Wells");
    const titles = b.chapters.map((c) => c.title);
    assert.ok(titles.includes("I") && titles.includes("XII") && titles.includes("Epilogue"), titles.join(" | "));
    for (const c of b.chapters) assert.ok(!/<script|<style|onclick|<link/i.test(c.html!), `unsafe markup in ${c.title}`);
  });
  await test("EPUB 2 fallback: toc.ncx used when nav is absent", async () => {
    const JSZip = (await import("jszip")).default;
    const src = await JSZip.loadAsync(readFileSync(join(root, "books/pikovaya-dama.epub")));
    const out = new JSZip();
    out.file("mimetype", "application/epub+zip", { compression: "STORE" });
    for (const [name, f] of Object.entries(src.files)) {
      if (f.dir || name === "mimetype" || name.endsWith("nav.xhtml")) continue;
      let data: string | Uint8Array = await f.async("uint8array");
      if (name.endsWith(".opf")) data = (await f.async("string")).replace(/<item id="nav"[^>]+\/>/, "");
      out.file(name, data);
    }
    const b = await parseEpub(new Blob([await out.generateAsync({ type: "uint8array" })]), "p.epub");
    assert.deepEqual(b.chapters.slice(1).map((c) => c.title), ["Глава I", "Глава II", "Глава III", "Глава IV", "Глава V", "Глава VI", "Заключение"]);
  });

  console.log("PDF");
  await test("outline → chapters with page ranges", async () => {
    const b = await parsePdf(blobOf(join(root, "books/dyadya-vanya.pdf")), "dyadya-vanya.pdf", undefined, pdfjs as never);
    assert.equal(b.pageCount, 59);
    assert.deepEqual(b.chapters.map((c) => c.title), ["Начало", "Действующие лица", "Действие первое", "Действие второе", "Действие третье", "Действие четвертое"]);
    assert.equal(b.chapters.at(-1)!.endPage, 59);
    for (let i = 1; i < b.chapters.length; i++) assert.equal(b.chapters[i].startPage, b.chapters[i - 1].endPage! + 1);
  });
  await test("no outline → heading-size detection", async () => {
    const b = await parsePdf(blobOf(join(root, "books/flatland.pdf")), "flatland.pdf", undefined, pdfjs as never);
    const titles = b.chapters.map((c) => c.title);
    assert.ok(b.chapters.length >= 15, `got ${b.chapters.length}: ${titles.join(" | ")}`);
    assert.ok(titles.includes("I. Of the Nature of Flatland"), titles.join(" | "));
    console.log(`    ${b.chapters.length} sections, e.g. ${titles.slice(0, 5).join(" | ")}`);
  });

  console.log("Audio");
  await test("M4B: QuickTime chapter track + ilst tags + cover", async () => {
    const meta = await readAudioMetadata(blobOf(join(root, "audio/pikovaya-dama-audio.m4b")));
    assert.equal(meta.container, "mp4");
    assert.equal(meta.album, "Пиковая дама");
    assert.equal(meta.artist, "Александр Пушкин");
    assert.deepEqual(meta.chapters.map((c) => c.title), ["Глава I", "Глава II", "Глава III", "Глава IV", "Глава V", "Глава VI", "Заключение"]);
    assert.ok(Math.abs(meta.chapters[1].start - 465.02) < 0.05, String(meta.chapters[1].start));
    assert.ok(meta.cover && meta.cover.size > 10_000);
    assert.ok(Math.abs(meta.duration! - 3619.1) < 1, String(meta.duration));
  });
  await test("MP3: ID3v2.4 CHAP/CTOC chapters + Info-header duration", async () => {
    const meta = await readAudioMetadata(blobOf(join(root, "audio/vystrel-audio.mp3")));
    assert.deepEqual(meta.chapters.map((c) => c.title), ["Глава I", "Глава II"]);
    assert.ok(Math.abs(meta.chapters[1].start - 800.99) < 0.01);
    assert.ok(Math.abs(meta.duration! - 1406.7) < 1.5, String(meta.duration));
    assert.ok(meta.cover && meta.cover.type === "image/jpeg");
  });
  await test("multi-file MP3 → one book, sorted by track tags", async () => {
    const files = readdirSync(join(root, "audio")).filter((f) => f.startsWith("dama-s-sobachkoy-audio-")).reverse();
    const book = await parseAudio(files.map((f) => ({ blob: blobOf(join(root, "audio", f), "audio/mpeg"), name: f })));
    assert.equal(book.title, "Дама с собачкой");
    assert.deepEqual(book.chapters.map((c) => c.title), ["Глава I", "Глава II", "Глава III", "Глава IV"]);
    assert.deepEqual(book.chapters.map((c) => c.sourceIndex), [0, 1, 2, 3]);
    assert.ok(book.sources[0].name.endsWith("-01.mp3"));
    assert.equal(book.chapters[1].startTime, book.chapters[0].duration);
  });
  await test("single MP3 without chapters → 20-minute markers", async () => {
    const book = await parseAudio([{ blob: blobOf(join(root, "audio/viy-audio.mp3")), name: "viy-audio.mp3" }]);
    assert.equal(book.chapters.length, 5);
    assert.equal(book.chapters[1].fileStart, 1200);
    assert.ok(Math.abs(book.duration! - 5947) < 3, String(book.duration));
  });
  await test("natural sort + auto chapter boundaries", async () => {
    assert.deepEqual(["track10.mp3", "track2.mp3", "track1.mp3"].sort(naturalCompare), ["track1.mp3", "track2.mp3", "track10.mp3"]);
    assert.deepEqual(["Глава 11.mp3", "Глава 9.mp3", "Глава 10.mp3"].sort(naturalCompare), ["Глава 9.mp3", "Глава 10.mp3", "Глава 11.mp3"]);
    assert.equal(autoChapters(40 * 60 + 1).length, 2);
    assert.equal(autoChapters(61 * 60).length, 3, "a 1-minute tail is folded into the last part");
    assert.equal(autoChapters(65 * 60).length, 4);
  });

  console.log("Detection");
  await test("magic bytes", async () => {
    assert.equal(await detectKind(blobOf(join(root, "books/flatland.pdf")), "x"), "pdf");
    assert.equal(await detectKind(blobOf(join(root, "books/time-machine.epub")), "x.epub"), "epub");
    assert.equal(await detectKind(blobOf(join(root, "books/anna-karenina.fb2.zip")), "anna-karenina.fb2.zip"), "fb2");
    assert.equal(await detectKind(blobOf(join(root, "books/otcy-i-deti.fb2")), "x"), "fb2");
    assert.equal(await detectKind(blobOf(join(root, "audio/vystrel-audio.mp3")), "x"), "audio");
    assert.equal(await detectKind(blobOf(join(root, "audio/pikovaya-dama-audio.m4b")), "x"), "audio");
  });

  console.log(failures ? `\n${failures} failed` : "\nall parser tests passed");
  process.exit(failures ? 1 : 0);
}

void main();

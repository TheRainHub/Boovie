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
  const { parseAudio, autoChapters, playableMime } = await import("../src/lib/parsers/audioParser");
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
      let data: string | Uint8Array<ArrayBuffer> = (await f.async("uint8array")) as Uint8Array<ArrayBuffer>;
      if (name.endsWith(".opf")) data = (await f.async("string")).replace(/<item id="nav"[^>]+\/>/, "");
      out.file(name, data);
    }
    const b = await parseEpub(new Blob([(await out.generateAsync({ type: "uint8array" })) as Uint8Array<ArrayBuffer>]), "p.epub");
    assert.deepEqual(b.chapters.slice(1).map((c) => c.title), ["Глава I", "Глава II", "Глава III", "Глава IV", "Глава V", "Глава VI", "Заключение"]);
  });

  console.log("PDF");
  await test("outline → chapters with page ranges", async () => {
    const b = await parsePdf(blobOf(join(root, "books/dyadya-vanya.pdf")), "dyadya-vanya.pdf", undefined, pdfjs as never);
    assert.equal(b.pageCount, 58);
    assert.deepEqual(b.chapters.map((c) => c.title), ["Начало", "Действующие лица", "Действие первое", "Действие второе", "Действие третье", "Действие четвертое"]);
    assert.equal(b.chapters.at(-1)!.endPage, 58);
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
  await test("FairPlay-protected M4B is refused with a clear message", async () => {
    const bytes = new Uint8Array(readFileSync(join(root, "audio/pikovaya-dama-audio.m4b")));
    // Turn the AAC sample entry into FairPlay's 'drms' (what iTunes/Apple Books purchases contain).
    const stsd = Buffer.from(bytes).indexOf("stsd");
    const entry = Buffer.from(bytes).indexOf("mp4a", stsd);
    assert.ok(stsd > 0 && entry > stsd && entry - stsd < 32);
    bytes.set([0x64, 0x72, 0x6d, 0x73], entry);
    const meta = await readAudioMetadata(new Blob([bytes]));
    assert.equal(meta.codec, "drms");
    assert.equal(meta.encrypted, true);
    await assert.rejects(parseAudio([{ blob: new Blob([bytes]), name: "Купленная книга.m4b" }]), /DRM/);
    const clean = await readAudioMetadata(blobOf(join(root, "audio/pikovaya-dama-audio.m4b")));
    assert.equal(clean.codec, "mp4a");
    assert.equal(clean.encrypted, false);
  });
  await test("chapter titles from file names drop track numbers", async () => {
    const { chapterTitleFromFile } = await import("../src/lib/parsers/audioParser");
    assert.equal(chapterTitleFromFile("01 Prologue.mp3"), "Prologue");
    assert.equal(chapterTitleFromFile("03. Глава третья.mp3"), "Глава третья");
    assert.equal(chapterTitleFromFile("Глава 1.mp3"), "Глава 1");
    assert.equal(chapterTitleFromFile("07.mp3"), "07");
  });
  await test("iOS-reported audio/x-m4b is stored as audio/mp4", async () => {
    assert.equal(playableMime({ blob: new Blob([], { type: "audio/x-m4b" }), name: "Владычица озера, часть 1.m4b" }), "audio/mp4");
    assert.equal(playableMime({ blob: new Blob([], { type: "audio/mpeg" }), name: "01.mp3" }), "audio/mpeg");
    assert.equal(playableMime({ blob: new Blob([], { type: "audio/ogg" }), name: "track" }), "audio/ogg");
  });
  await test("natural sort + auto chapter boundaries", async () => {
    assert.deepEqual(["track10.mp3", "track2.mp3", "track1.mp3"].sort(naturalCompare), ["track1.mp3", "track2.mp3", "track10.mp3"]);
    assert.deepEqual(["Глава 11.mp3", "Глава 9.mp3", "Глава 10.mp3"].sort(naturalCompare), ["Глава 9.mp3", "Глава 10.mp3", "Глава 11.mp3"]);
    assert.equal(autoChapters(40 * 60 + 1).length, 2);
    assert.equal(autoChapters(61 * 60).length, 3, "a 1-minute tail is folded into the last part");
    assert.equal(autoChapters(65 * 60).length, 4);
  });

  console.log("Folders, archives, names");
  const { cleanTitle, splitAuthorTitle } = await import("../src/lib/covers/names");
  const { planImport } = await import("../src/lib/library/grouping");
  const { listZip, extractZipEntry, isZip } = await import("../src/lib/parsers/zipStream");
  const JSZip = (await import("jszip")).default;
  await test("titles cleaned from file and folder names", async () => {
    assert.equal(cleanTitle("Владычица озера, часть 1.m4b"), "Владычица озера");
    assert.equal(cleanTitle("01 - Дама с собачкой [MP3 128kbps] (2015).mp3"), "Дама с собачкой");
    assert.equal(cleanTitle("Ведьмак_Кровь_эльфов_CD2.mp3"), "Ведьмак Кровь эльфов");
    assert.equal(cleanTitle("The Time Machine (audiobook).m4b"), "The Time Machine");
    assert.deepEqual(splitAuthorTitle("Сапковский Анджей - Владычица озера (2010) [MP3]"), { author: "Сапковский Анджей", title: "Владычица озера" });
    assert.equal(splitAuthorTitle("Владычица озера"), null);
  });
  await test("a folder of chapter files becomes one book; CD subfolders merge; folder image is the cover", async () => {
    const f = (path: string, size = 10, type = "") => ({ blob: new Blob([new Uint8Array(size)], { type }), name: path.split("/").pop()!, path });
    const plan = planImport([
      f("Сапковский Анджей - Владычица озера/CD1/01 Глава первая.mp3"),
      f("Сапковский Анджей - Владычица озера/CD2/01 Глава десятая.mp3"),
      f("Сапковский Анджей - Владычица озера/CD1/02 Глава вторая.mp3"),
      f("Сапковский Анджей - Владычица озера/folder.jpg", 500),
      f("Сапковский Анджей - Владычица озера/CD1/scan_back.jpg", 9000),
      f("Сапковский Анджей - Владычица озера/info.txt"),
      f("Другая книга/01.m4a"),
      f("Другая книга/02.m4a"),
      f("Отцы и дети.fb2"),
    ]);
    assert.equal(plan.audioGroups.length, 2);
    const [witcher, other] = plan.audioGroups;
    assert.equal(witcher.audio.length, 3);
    assert.deepEqual(witcher.hint, { author: "Сапковский Анджей", title: "Владычица озера" });
    assert.equal(witcher.cover?.name, "folder.jpg", "conventional cover name wins over a larger scan");
    assert.equal(other.hint.title, "Другая книга");
    assert.equal(other.cover, undefined);
    assert.deepEqual(plan.documents.map((d) => d.name), ["Отцы и дети.fb2"]);
    // Untagged tracks are ordered by their path, so CD1/02 comes before CD2/01.
    const order = [...witcher.audio].sort((a, b) => naturalCompare(a.path, b.path)).map((f) => f.path.split("/").slice(-2).join("/"));
    assert.deepEqual(order, ["CD1/01 Глава первая.mp3", "CD1/02 Глава вторая.mp3", "CD2/01 Глава десятая.mp3"]);
    assert.deepEqual(plan.ignored.map((d) => d.name), ["info.txt"]);
  });
  await test("streaming ZIP (deflate + store) of an audiobook folder → one book", async () => {
    const zip = new JSZip();
    const mp3s = readdirSync(join(root, "audio")).filter((n) => n.startsWith("dama-s-sobachkoy-audio-"));
    for (const n of mp3s) zip.file(`Чехов Антон - Дама с собачкой/${n}`, readFileSync(join(root, "audio", n)), { compression: "DEFLATE" });
    zip.file("Чехов Антон - Дама с собачкой/cover.jpg", readFileSync(join(root, "covers/dama-s-sobachkoy.jpg")), { compression: "STORE" });
    zip.file("__MACOSX/Чехов Антон - Дама с собачкой/._cover.jpg", "junk");
    const archive = new Blob([(await zip.generateAsync({ type: "uint8array" })) as Uint8Array<ArrayBuffer>]);
    assert.ok(await isZip(archive));
    const entries = await listZip(archive);
    assert.equal(entries.length, 5, entries.map((e) => e.path).join(", "));
    const files = [];
    for (const e of entries) {
      const blob = await extractZipEntry(archive, e);
      assert.equal(blob.size, e.size, `size of ${e.path}`);
      files.push({ blob, name: e.path.split("/").pop()!, path: e.path });
    }
    const plan = planImport(files);
    assert.equal(plan.audioGroups.length, 1);
    assert.equal(plan.audioGroups[0].cover?.name, "cover.jpg");
    const book = await parseAudio(plan.audioGroups[0].audio, undefined, { hint: plan.audioGroups[0].hint });
    assert.equal(book.chapters.length, 4);
    assert.equal(book.author, "Антон Чехов", "tags win over the folder name");
  });
  await test("ZIP with CP866 file names (Windows archivers)", async () => {
    const entries = await listZip(blobOf(join(process.cwd(), "scripts/fixtures/cp866-names.zip")));
    assert.deepEqual(entries.map((e) => e.path), ["Глава 01.txt", "Обложка.jpg"]);
    assert.equal(await (await extractZipEntry(blobOf(join(process.cwd(), "scripts/fixtures/cp866-names.zip")), entries[0])).text(), "hello");
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

  console.log("Integrations");
  const { parseOpds, formatLabel, isSupportedType } = await import("../src/lib/integrations/opds");
  const { chapterParagraphs, speechChunks } = await import("../src/lib/integrations/speech");
  const { mp3Frames } = await import("../src/lib/parsers/audioMetadata");
  await test("OPDS: Librarr library feed → entries, absolute download links, paging", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog" xmlns:dc="http://purl.org/dc/terms/" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>urn:librarr:library</id><title>My Library</title><updated>2026-10-24T10:00:00Z</updated>
  <link rel="self" href="/opds/books?page=1" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="next" href="/opds/books?page=2" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <opensearch:totalResults>73</opensearch:totalResults>
  <entry><title>Мастер и Маргарита</title><id>urn:librarr:item:12</id><updated>2026-10-01T00:00:00Z</updated>
    <author><name>Михаил Булгаков</name></author><dc:format>application/epub+zip</dc:format>
    <link rel="http://opds-spec.org/acquisition" href="/opds/download/12" type="application/epub+zip"/></entry>
  <entry><title>Dune &amp; Co</title><id>urn:librarr:item:13</id><updated>2026-10-01T00:00:00Z</updated>
    <dc:format>audio/mp4</dc:format><link rel="http://opds-spec.org/acquisition" href="/opds/download/13" type="audio/mp4"/></entry>
</feed>`;
    const feed = parseOpds(xml, "https://books.example.net", new LinkedomParser() as unknown as DOMParser);
    assert.equal(feed.total, 73);
    assert.equal(feed.next, "https://books.example.net/opds/books?page=2");
    assert.equal(feed.entries.length, 2);
    assert.equal(feed.entries[0].author, "Михаил Булгаков");
    assert.equal(feed.entries[0].acquisitions[0].href, "https://books.example.net/opds/download/12");
    assert.equal(feed.entries[1].title, "Dune & Co");
    assert.equal(formatLabel(feed.entries[1].acquisitions[0].type!), "M4B");
    assert.ok(isSupportedType("application/epub+zip") && !isSupportedType("application/x-mobipocket-ebook"));
  });
  await test("speech: chapter HTML → paragraphs (no footnote marks) → chunks at sentence ends", async () => {
    const parser = new LinkedomParser() as unknown as DOMParser;
    const html = '<h2>Глава I</h2><p>Первый абзац.<sup class="noteref">1</sup></p><div class="poem"><div class="stanza"><p>Строка один</p><p>Строка два</p></div></div>';
    assert.deepEqual(chapterParagraphs(html, parser), ["Глава I", "Первый абзац.", "Строка один", "Строка два"]);
    const long = Array.from({ length: 60 }, (_, i) => `Предложение номер ${i} довольно длинное, чтобы набрать объём.`).join(" ");
    const chunks = speechChunks(["Короткий абзац.", long], 400);
    assert.ok(chunks.every((c) => c.length <= 400), "every chunk within the limit");
    assert.ok(chunks.slice(1).every((c) => /[.!?…]$/.test(c)), "pieces end at sentence boundaries");
    assert.equal(chunks.join(" ").replace(/\s+/g, " ").length, ["Короткий абзац.", long].join(" ").length);
  });
  await test("MP3 pieces concatenate: tags and the Xing frame are dropped, duration adds up", async () => {
    const files = readdirSync(join(root, "audio")).filter((f) => f.startsWith("dama-s-sobachkoy-audio-")).sort().slice(0, 2);
    const parts = files.map((f) => new Uint8Array(readFileSync(join(root, "audio", f))));
    const metas = await Promise.all(parts.map((p) => readAudioMetadata(new Blob([p as BlobPart]))));
    const joined = new Blob(parts.map((p) => mp3Frames(p) as BlobPart), { type: "audio/mpeg" });
    const meta = await readAudioMetadata(joined);
    const sum = metas.reduce((s, m) => s + (m.duration ?? 0), 0);
    assert.equal(meta.container, "mp3");
    assert.ok(Math.abs((meta.duration ?? 0) - sum) / sum < 0.08, `joined ${meta.duration} vs ${sum}`);
  });

  console.log(failures ? `\n${failures} failed` : "\nall parser tests passed");
  process.exit(failures ? 1 : 0);
}

void main();

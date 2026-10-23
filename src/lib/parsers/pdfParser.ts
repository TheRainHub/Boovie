/**
 * PDF parser built on pdf.js. Chapters come from the document outline (bookmarks); when a PDF has none,
 * pages are grouped by detected headings (text noticeably larger than the body font near the top of a page),
 * and as a last resort into fixed 15-page sections — so every PDF gets a navigable chapter list.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";
import { loadPdfjs, type PdfLib } from "../pdf/pdfjs";
import { normalizeSpace, stripExtension } from "./text";
import { ParseError, type ParsedBook, type ParsedChapter, type ProgressFn } from "./types";

export const PAGES_PER_SECTION = 15;
const HEADING_SCAN_LIMIT = 600;

type OutlineNode = Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>[number];

async function destPage(doc: PDFDocumentProxy, dest: OutlineNode["dest"]): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!explicit || !explicit.length) return null;
    const ref = explicit[0];
    const index = typeof ref === "number" ? ref : await doc.getPageIndex(ref);
    return index + 1;
  } catch {
    return null;
  }
}

async function outlineChapters(doc: PDFDocumentProxy): Promise<ParsedChapter[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline?.length) return [];
  const flat: { title: string; group?: string; page: number }[] = [];
  // Leaves become chapters; entries with children become the group (part) title of their descendants.
  const walk = async (nodes: OutlineNode[], depth: number, group?: string) => {
    for (const n of nodes) {
      const title = normalizeSpace(n.title);
      if (n.items?.length && depth < 2) {
        const before = flat.length;
        await walk(n.items, depth + 1, title || group);
        if (flat.length > before) continue;
      }
      const page = await destPage(doc, n.dest);
      if (page && title) flat.push({ title, group, page });
    }
  };
  await walk(outline, 0);
  flat.sort((a, b) => a.page - b.page);
  const dedup = flat.filter((e, i) => i === 0 || e.page !== flat[i - 1].page);
  return toRanges(dedup, doc.numPages);
}

function toRanges(starts: { title: string; group?: string; page: number }[], numPages: number): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  if (starts.length && starts[0].page > 1) out.push({ title: "Начало", startPage: 1, endPage: starts[0].page - 1 });
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? Math.max(s.page, starts[i + 1].page - 1) : numPages;
    out.push({ title: s.title, group: s.group, startPage: s.page, endPage: end });
  });
  return out;
}

interface TextItemLike {
  str: string;
  transform: number[];
}

async function headingChapters(doc: PDFDocumentProxy, onProgress?: ProgressFn): Promise<ParsedChapter[]> {
  const pages = Math.min(doc.numPages, HEADING_SCAN_LIMIT);
  const perPage: { size: number; text: string; y: number }[][] = [];
  const sizeWeight = new Map<number, number>();
  for (let p = 1; p <= pages; p++) {
    if (p % 10 === 0) onProgress?.(0.2 + 0.7 * (p / pages), `Анализ страниц: ${p} из ${pages}`);
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as TextItemLike[])
      .filter((i) => typeof i.str === "string" && i.str.trim())
      .map((i) => ({ size: Math.round(Math.hypot(i.transform[2], i.transform[3]) * 2) / 2, text: i.str, y: i.transform[5] }));
    for (const it of items) sizeWeight.set(it.size, (sizeWeight.get(it.size) ?? 0) + it.text.length);
    perPage.push(items);
    page.cleanup();
  }
  const body = [...sizeWeight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!body) return [];

  const starts: { title: string; page: number }[] = [];
  perPage.forEach((items, idx) => {
    if (!items.length) return;
    const maxSize = Math.max(...items.map((i) => i.size));
    if (maxSize < body * 1.4) return;
    // Heading must sit in the upper part of the page (above most of the body text).
    const big = items.filter((i) => i.size >= maxSize - 0.5);
    const topY = Math.max(...items.map((i) => i.y));
    if (big[0].y < topY - 220) return;
    let title = normalizeSpace(big.map((i) => i.text).join(" ")).slice(0, 90);
    // Bare numerals ("IV", "12") read better with the line that follows them (usually the chapter name).
    if (title.length <= 8) {
      const minY = Math.min(...big.map((i) => i.y));
      const below = items.filter((i) => i.y < minY - 1 && i.size < maxSize - 0.5);
      const lineY = below.length ? Math.max(...below.map((i) => i.y)) : null;
      const sub = lineY === null ? "" : normalizeSpace(below.filter((i) => Math.abs(i.y - lineY) < 1).map((i) => i.text).join(" "));
      if (sub && sub.length <= 90) title = `${title}. ${sub}`;
    }
    if (title.length >= 1) starts.push({ title, page: idx + 1 });
  });
  if (starts.length < 2 || starts.length > pages / 1.5) return [];
  return toRanges(starts, doc.numPages);
}

export function fixedSections(numPages: number): ParsedChapter[] {
  const out: ParsedChapter[] = [];
  for (let start = 1; start <= numPages; start += PAGES_PER_SECTION) {
    const end = Math.min(numPages, start + PAGES_PER_SECTION - 1);
    out.push({ title: start === end ? `Страница ${start}` : `Страницы ${start}–${end}`, startPage: start, endPage: end });
  }
  return out;
}

async function renderCover(doc: PDFDocumentProxy): Promise<Blob | undefined> {
  if (typeof document === "undefined") return undefined;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 480 / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob | undefined>((r) => canvas.toBlob((b) => r(b ?? undefined), "image/jpeg", 0.85));
  } catch {
    return undefined;
  }
}

export async function parsePdf(file: Blob, fileName: string, onProgress?: ProgressFn, pdfjs?: PdfLib): Promise<ParsedBook> {
  onProgress?.(0.02, "Открытие PDF");
  const lib = pdfjs ?? (await loadPdfjs());
  let doc: PDFDocumentProxy;
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  try {
    doc = await task.promise;
  } catch (e) {
    throw new ParseError(`Не удалось открыть PDF: ${(e as Error).message}`);
  }
  try {
    const meta = await doc.getMetadata().catch(() => null);
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    const title = normalizeSpace(String(info.Title ?? "")) || stripExtension(fileName);
    const author = normalizeSpace(String(info.Author ?? "")) || "Неизвестный автор";

    onProgress?.(0.1, "Оглавление");
    let chapters = await outlineChapters(doc);
    if (chapters.length < 2) chapters = await headingChapters(doc, onProgress);
    if (chapters.length < 2) chapters = fixedSections(doc.numPages);

    onProgress?.(0.95, "Обложка");
    const cover = await renderCover(doc);
    onProgress?.(1);
    return {
      format: "pdf",
      title,
      author,
      cover,
      chapters,
      assets: [],
      sources: [{ blob: file, name: fileName, mime: "application/pdf" }],
      pageCount: doc.numPages,
    };
  } finally {
    void task.destroy();
  }
}

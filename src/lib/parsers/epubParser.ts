/**
 * EPUB 2/3 parser: unpacks the archive with JSZip, follows META-INF/container.xml to the OPF package,
 * reads manifest + spine, builds the table of contents from nav.xhtml (EPUB 3) or toc.ncx (EPUB 2), and turns
 * spine documents into sanitized chapters. Images are extracted as assets and referenced by key.
 * When the TOC points at several fragments inside one spine document, the document is split at those anchors.
 */
import JSZip from "jszip";
import { compactHtml, serializeNode, textLength, type SanitizeContext } from "./sanitize";
import { allElements, childElements, descendants, firstChild, localName, mimeFromName, normalizeSpace, parseXml, stripExtension } from "./text";
import { ParseError, type ParsedAsset, type ParsedBook, type ParsedChapter, type ProgressFn } from "./types";

interface ManifestItem {
  id: string;
  href: string; // absolute path inside the zip
  type: string;
  properties: string;
}

interface TocEntry {
  title: string;
  path: string;
  fragment?: string;
  group?: string;
}

function dirOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(0, i + 1) : "";
}

export function resolvePath(base: string, rel: string): string {
  if (/^[a-z]+:/i.test(rel)) return rel;
  const clean = rel.split("#")[0].split("?")[0];
  let decoded = clean;
  try {
    decoded = decodeURIComponent(clean);
  } catch {
    /* keep raw */
  }
  const parts = (decoded.startsWith("/") ? decoded.slice(1) : dirOf(base) + decoded).split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

function fragmentOf(href: string): string | undefined {
  const i = href.indexOf("#");
  return i >= 0 ? decodeURIComponent(href.slice(i + 1)) || undefined : undefined;
}

async function readText(zip: JSZip, path: string): Promise<string | null> {
  const f = zip.file(path) ?? Object.values(zip.files).find((x) => x.name.toLowerCase() === path.toLowerCase()) ?? null;
  return f ? f.async("string") : null;
}

function parseNav(doc: Document, navPath: string): TocEntry[] {
  const navs = descendants(doc, "nav");
  const toc = navs.find((n) => /toc/.test(n.getAttribute("epub:type") ?? n.getAttribute("type") ?? "")) ?? navs[0];
  if (!toc) return [];
  const out: TocEntry[] = [];
  const walk = (ol: Element, group?: string) => {
    for (const li of childElements(ol, "li")) {
      const a = firstChild(li, "a") ?? firstChild(li, "span");
      const title = normalizeSpace(a?.textContent);
      const href = a && localName(a) === "a" ? a.getAttribute("href") : null;
      if (href && title) out.push({ title, path: resolvePath(navPath, href), fragment: fragmentOf(href), group });
      const sub = firstChild(li, "ol");
      if (sub) walk(sub, title || group);
    }
  };
  const ol = firstChild(toc, "ol") ?? descendants(toc, "ol")[0];
  if (ol) walk(ol);
  return out;
}

function parseNcx(doc: Document, ncxPath: string): TocEntry[] {
  const out: TocEntry[] = [];
  const walk = (parent: Element, group?: string) => {
    for (const np of childElements(parent, "navpoint")) {
      const title = normalizeSpace(firstChild(firstChild(np, "navlabel"), "text")?.textContent);
      const src = firstChild(np, "content")?.getAttribute("src");
      if (src && title) out.push({ title, path: resolvePath(ncxPath, src), fragment: fragmentOf(src), group });
      walk(np, title || group);
    }
  };
  const navMap = descendants(doc, "navmap")[0];
  if (navMap) walk(navMap);
  return out;
}

/** Split body children into ranges at the given anchor ids (ancestor at body level). */
function splitAtAnchors(body: Element, anchors: string[]): { anchor?: string; nodes: Node[] }[] {
  const top = Array.from(body.childNodes);
  const startIndex = new Map<number, string>();
  for (const id of anchors) {
    const target = allElements(body).find((e) => e.getAttribute("id") === id);
    if (!target) continue;
    let n: Node | null = target;
    while (n && n.parentNode !== body) n = n.parentNode;
    const idx = n ? top.indexOf(n as ChildNode) : -1;
    if (idx >= 0 && !startIndex.has(idx)) startIndex.set(idx, id);
  }
  const cuts = [...startIndex.keys()].sort((a, b) => a - b);
  if (cuts.length === 0) return [{ nodes: top }];
  const ranges: { anchor?: string; nodes: Node[] }[] = [];
  if (cuts[0] > 0) ranges.push({ nodes: top.slice(0, cuts[0]) });
  cuts.forEach((c, i) => ranges.push({ anchor: startIndex.get(c), nodes: top.slice(c, cuts[i + 1] ?? top.length) }));
  return ranges;
}

export async function parseEpub(file: Blob, fileName: string, onProgress?: ProgressFn): Promise<ParsedBook> {
  onProgress?.(0.02, "Распаковка EPUB");
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new ParseError("Не удалось открыть архив EPUB");
  }
  const container = await readText(zip, "META-INF/container.xml");
  let opfPath = container ? descendants(parseXml(container), "rootfile")[0]?.getAttribute("full-path") ?? "" : "";
  if (!opfPath) opfPath = Object.keys(zip.files).find((n) => n.endsWith(".opf")) ?? "";
  const opfText = opfPath ? await readText(zip, opfPath) : null;
  if (!opfText) throw new ParseError("В EPUB не найден файл пакета (.opf)");
  const opf = parseXml(opfText);

  const meta = descendants(opf, "metadata")[0];
  const dc = (name: string) => (meta ? descendants(meta, name).map((e) => normalizeSpace(e.textContent)).filter(Boolean) : []);
  const title = dc("title")[0] || stripExtension(fileName);
  const author = dc("creator").join(", ") || "Неизвестный автор";
  const language = dc("language")[0];
  const description = dc("description")[0]?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const manifest = new Map<string, ManifestItem>();
  const byPath = new Map<string, ManifestItem>();
  for (const it of descendants(opf, "item")) {
    const id = it.getAttribute("id") ?? "";
    const href = it.getAttribute("href") ?? "";
    const item = { id, href: resolvePath(opfPath, href), type: it.getAttribute("media-type") ?? "", properties: it.getAttribute("properties") ?? "" };
    manifest.set(id, item);
    byPath.set(item.href, item);
  }
  const spineEl = descendants(opf, "spine")[0];
  const spine = (spineEl ? childElements(spineEl, "itemref") : [])
    .filter((r) => r.getAttribute("linear") !== "no")
    .map((r) => manifest.get(r.getAttribute("idref") ?? ""))
    .filter((x): x is ManifestItem => !!x && /html|xml/.test(x.type));
  if (spine.length === 0) throw new ParseError("Пустой spine: в EPUB нет читаемых документов");

  // Table of contents.
  let toc: TocEntry[] = [];
  const navItem = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes("nav"));
  if (navItem) {
    const t = await readText(zip, navItem.href);
    if (t) toc = parseNav(parseXml(t), navItem.href);
  }
  if (toc.length === 0) {
    const ncxItem = manifest.get(spineEl?.getAttribute("toc") ?? "") ?? [...manifest.values()].find((m) => m.type === "application/x-dtbncx+xml");
    if (ncxItem) {
      const t = await readText(zip, ncxItem.href);
      if (t) toc = parseNcx(parseXml(t), ncxItem.href);
    }
  }

  // Cover image.
  let coverPath = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes("cover-image"))?.href;
  if (!coverPath && meta) {
    const metaCover = descendants(meta, "meta").find((m) => m.getAttribute("name") === "cover")?.getAttribute("content");
    const item = metaCover ? manifest.get(metaCover) : undefined;
    if (item && item.type.startsWith("image/")) coverPath = item.href;
  }
  let cover: Blob | undefined;
  if (coverPath && zip.file(coverPath) && !coverPath.endsWith(".svg")) {
    cover = new Blob([(await zip.file(coverPath)!.async("uint8array")) as Uint8Array<ArrayBuffer>], { type: byPath.get(coverPath)?.type || mimeFromName(coverPath) });
  }

  // Assets are loaded lazily as chapters reference them.
  const assets = new Map<string, ParsedAsset>();
  const pendingAssets: Promise<void>[] = [];
  const spinePaths = new Set(spine.map((s) => s.href));
  const chapterIndexByPath = new Map<string, number>();

  const chapters: ParsedChapter[] = [];
  const pendingLinks: { chapter: number }[] = [];

  for (let si = 0; si < spine.length; si++) {
    const item = spine[si];
    onProgress?.(0.05 + 0.9 * (si / spine.length), `Глава ${si + 1} из ${spine.length}`);
    const raw = await readText(zip, item.href);
    if (!raw) continue;
    let doc = new DOMParser().parseFromString(raw, "application/xhtml+xml");
    if (descendants(doc, "parsererror").length) doc = new DOMParser().parseFromString(raw, "text/html");
    const body = descendants(doc, "body")[0];
    if (!body) continue;

    const ctx: SanitizeContext = {
      resolveImage: (src) => {
        const path = resolvePath(item.href, src);
        const entry = zip.file(path);
        if (!entry) return null;
        if (!assets.has(path)) {
          const mime = byPath.get(path)?.type || mimeFromName(path);
          const placeholder: ParsedAsset = { key: path, name: path.split("/").pop() ?? path, blob: new Blob() };
          assets.set(path, placeholder);
          pendingAssets.push(entry.async("uint8array").then((bytes) => {
            placeholder.blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
          }));
        }
        return path;
      },
      resolveLink: (href) => {
        if (href.startsWith("#")) return `${item.href}${href}`;
        const path = resolvePath(item.href, href);
        if (!spinePaths.has(path)) return null;
        const frag = fragmentOf(href);
        return frag ? `${path}#${frag}` : path;
      },
    };

    const entries = toc.filter((t) => t.path === item.href);
    const fragments = entries.map((e) => e.fragment).filter((f): f is string => !!f);
    const ranges = fragments.length >= 2 ? splitAtAnchors(body, fragments) : [{ nodes: Array.from(body.childNodes) }];

    ranges.forEach((range, ri) => {
      const html = compactHtml(range.nodes.map((n) => serializeNode(n, ctx)).join(""));
      const chars = textLength(html);
      if (chars === 0 && !html.includes("<img")) return;
      const entry = range.anchor
        ? entries.find((e) => e.fragment === range.anchor)
        // Several entries may target the same file (a part and its first chapter): the deepest one wins.
        : ri === 0 ? entries.filter((e) => !e.fragment).at(-1) ?? (fragments.length < 2 ? entries[0] : undefined) : undefined;
      const heading = descendants(body, "h1")[0] ?? descendants(body, "h2")[0] ?? descendants(body, "h3")[0];
      const docTitle = normalizeSpace(descendants(doc, "title")[0]?.textContent);
      const fallback = (ri === 0 && normalizeSpace(heading?.textContent)) || docTitle || (chapters.length === 0 ? "Начало" : `Раздел ${chapters.length + 1}`);
      if (!chapterIndexByPath.has(item.href)) chapterIndexByPath.set(item.href, chapters.length);
      chapters.push({ title: entry?.title ?? fallback, group: entry?.group, html, charCount: chars });
      if (html.includes("data-link")) pendingLinks.push({ chapter: chapters.length - 1 });
    });
  }
  await Promise.all(pendingAssets);

  // Rewrite internal links to chapter indices: data-link="path#frag" -> data-link="ch:N#frag".
  for (const { chapter } of pendingLinks) {
    const ch = chapters[chapter];
    ch.html = ch.html!.replace(/data-link="([^"#]*)(#[^"]*)?"/g, (_, path: string, frag = "") => {
      const idx = chapterIndexByPath.get(path);
      return idx === undefined ? "" : `data-link="ch:${idx}${frag}"`;
    });
  }
  if (chapters.length === 0) throw new ParseError("В EPUB не найдено текста");
  onProgress?.(1);

  return {
    format: "epub",
    title,
    author,
    annotation: description,
    language,
    cover,
    chapters,
    assets: [...assets.values()].filter((a) => a.blob.size > 0),
    sources: [{ blob: file, name: fileName, mime: "application/epub+zip" }],
  };
}

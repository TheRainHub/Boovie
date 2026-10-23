/**
 * FictionBook 2 parser: XML via DOMParser (UTF-8 / windows-1251 / koi8-r via TextDecoder), metadata from
 * <description>, base64 <binary> images, and automatic chapter splitting along nested <section> elements.
 * Also accepts .fb2.zip archives.
 */
import JSZip from "jszip";
import { compactHtml, escapeAttr, escapeText, textLength } from "./sanitize";
import { base64ToBytes, childElements, decodeXml, descendants, firstChild, localName, normalizeSpace, parseXml, stripExtension } from "./text";
import { ParseError, type ParsedAsset, type ParsedBook, type ParsedChapter, type ProgressFn } from "./types";

/** Split oversized flat bodies into readable parts of roughly this many characters. */
const FLAT_CHUNK = 14000;

interface Ctx {
  binaries: Map<string, { mime: string; data: string }>;
  assets: Map<string, ParsedAsset>;
}

function href(el: Element): string {
  for (const a of Array.from(el.attributes)) {
    if (a.localName === "href" || a.name.endsWith(":href") || a.name === "href") return a.value;
  }
  return "";
}

function imageAsset(id: string, ctx: Ctx): string | null {
  if (ctx.assets.has(id)) return id;
  const bin = ctx.binaries.get(id);
  if (!bin) return null;
  const bytes = base64ToBytes(bin.data);
  ctx.assets.set(id, { key: id, name: id, blob: new Blob([bytes], { type: bin.mime }) });
  return id;
}

/** Convert FB2 inline/block markup to HTML. */
function convert(node: Node, ctx: Ctx): string {
  if (node.nodeType === 3 || node.nodeType === 4) return escapeText(node.nodeValue ?? "");
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const kids = () => Array.from(el.childNodes).map((c) => convert(c, ctx)).join("");
  switch (localName(el)) {
    case "p": return `<p>${kids()}</p>`;
    case "empty-line": return `<p class="empty-line">&nbsp;</p>`;
    case "title": {
      const lines = childElements(el, "p").map((p) => Array.from(p.childNodes).map((c) => convert(c, ctx)).join(""));
      return lines.length ? `<h2>${lines.join("<br>")}</h2>` : `<h2>${kids()}</h2>`;
    }
    case "subtitle": return `<h3 class="subtitle">${kids()}</h3>`;
    case "epigraph": return `<blockquote class="epigraph">${kids()}</blockquote>`;
    case "cite": return `<blockquote class="cite">${kids()}</blockquote>`;
    case "text-author": return `<p class="text-author">${kids()}</p>`;
    case "poem": return `<div class="poem">${kids()}</div>`;
    case "stanza": return `<div class="stanza">${kids()}</div>`;
    case "v": return `<p class="verse">${kids()}</p>`;
    case "date": return `<p class="text-author">${kids()}</p>`;
    case "emphasis": return `<em>${kids()}</em>`;
    case "strong": return `<strong>${kids()}</strong>`;
    case "strikethrough": return `<s>${kids()}</s>`;
    case "sub": return `<sub>${kids()}</sub>`;
    case "sup": return `<sup>${kids()}</sup>`;
    case "code": return `<code>${kids()}</code>`;
    case "style": return `<span>${kids()}</span>`;
    case "a": {
      const target = href(el);
      if (/^https?:\/\//i.test(target)) return `<a href="${escapeAttr(target)}" target="_blank" rel="noopener noreferrer">${kids()}</a>`;
      if (el.getAttribute("type") === "note" || target.startsWith("#")) {
        return `<sup class="noteref"><a data-link="${escapeAttr(target)}">${kids()}</a></sup>`;
      }
      return kids();
    }
    case "image": {
      const key = imageAsset(href(el).replace(/^#/, ""), ctx);
      return key ? `<div class="figure"><img data-asset="${escapeAttr(key)}" alt=""></div>` : "";
    }
    case "table": return `<table>${kids()}</table>`;
    case "tr": return `<tr>${kids()}</tr>`;
    case "td": case "th": {
      const tag = localName(el);
      return `<${tag}>${kids()}</${tag}>`;
    }
    case "section": {
      const id = el.getAttribute("id");
      return `<div class="section"${id ? ` data-id="${escapeAttr(id)}"` : ""}>${kids()}</div>`;
    }
    case "annotation": return `<div class="annotation">${kids()}</div>`;
    default: return kids();
  }
}

function titleText(section: Element): string {
  const t = firstChild(section, "title");
  if (!t) return "";
  const lines = childElements(t, "p").map((p) => normalizeSpace(p.textContent));
  return (lines.length ? lines.join(". ") : normalizeSpace(t.textContent)).replace(/\.\s*\./g, ".");
}

function chapterFrom(title: string, group: string | undefined, html: string): ParsedChapter {
  const clean = compactHtml(html);
  return { title, group, html: clean, charCount: textLength(clean) };
}

function splitFlat(nodes: Element[], ctx: Ctx, baseTitle: string, group: string | undefined, out: ParsedChapter[]) {
  let buf = "";
  let size = 0;
  let part = 1;
  const flush = () => {
    if (!buf) return;
    out.push(chapterFrom(`${baseTitle} · часть ${part++}`, group, buf));
    buf = "";
    size = 0;
  };
  for (const n of nodes) {
    const html = convert(n, ctx);
    buf += html;
    size += normalizeSpace(n.textContent).length;
    if (size >= FLAT_CHUNK) flush();
  }
  if (part === 1) {
    out.push(chapterFrom(baseTitle, group, buf));
  } else {
    flush();
  }
}

function walkSection(section: Element, ctx: Ctx, group: string | undefined, out: ParsedChapter[], prefix = "") {
  const title = titleText(section) || `Глава ${out.length + 1}`;
  const children = childElements(section);
  const subsections = children.filter((c) => localName(c) === "section");
  if (subsections.length === 0) {
    const html = children.map((c) => convert(c, ctx)).join("");
    if (textLength(html) > FLAT_CHUNK * 4) {
      // Huge single section: keep the heading on the first part, split the rest at paragraph boundaries.
      splitFlat(children, ctx, title, group, out);
    } else if (normalizeSpace(section.textContent) || /<img/.test(html)) {
      out.push(chapterFrom(prefix + title, group, html));
    }
    return;
  }
  // Intro content of a part (its title, epigraph, preface paragraphs) before the first nested section.
  const intro = children.slice(0, children.indexOf(subsections[0]));
  const introText = intro.filter((c) => localName(c) !== "title").map((c) => normalizeSpace(c.textContent)).join("");
  let carry = "";
  if (introText.length > 0) {
    out.push(chapterFrom(title, group, intro.map((c) => convert(c, ctx)).join("")));
  } else {
    carry = intro.map((c) => convert(c, ctx)).join("");
  }
  const childGroup = titleText(section) || group;
  subsections.forEach((sub, i) => {
    const before = out.length;
    walkSection(sub, ctx, childGroup, out);
    // Show the part heading on top of its first chapter.
    if (i === 0 && carry && out.length > before) {
      const ch = out[before];
      ch.html = compactHtml(carry + (ch.html ?? ""));
      ch.charCount = textLength(ch.html);
    }
  });
}

export function parseFb2Text(text: string, fileName = "book.fb2"): ParsedBook {
  const doc = parseXml(text);
  const root = descendants(doc, "fictionbook")[0] ?? doc.documentElement;
  if (!root || !/fictionbook/i.test(root.nodeName)) throw new ParseError("Файл не похож на FictionBook (FB2)");

  const ctx: Ctx = { binaries: new Map(), assets: new Map() };
  for (const bin of descendants(root, "binary")) {
    const id = bin.getAttribute("id");
    if (id) ctx.binaries.set(id, { mime: bin.getAttribute("content-type") || "image/jpeg", data: bin.textContent ?? "" });
  }

  const titleInfo = descendants(root, "title-info")[0];
  const title = normalizeSpace(firstChild(titleInfo, "book-title")?.textContent) || stripExtension(fileName);
  const authors = titleInfo ? childElements(titleInfo, "author").map((a) => {
    const parts = ["first-name", "middle-name", "last-name"].map((n) => normalizeSpace(firstChild(a, n)?.textContent)).filter(Boolean);
    return parts.length ? parts.join(" ") : normalizeSpace(firstChild(a, "nickname")?.textContent);
  }).filter(Boolean) : [];
  const annotationEl = firstChild(titleInfo, "annotation");
  const annotation = annotationEl
    ? childElements(annotationEl).map((p) => normalizeSpace(p.textContent)).filter(Boolean).join("\n\n")
    : undefined;
  const language = normalizeSpace(firstChild(titleInfo, "lang")?.textContent) || undefined;

  let cover: Blob | undefined;
  const coverImage = firstChild(firstChild(titleInfo, "coverpage"), "image");
  if (coverImage) {
    const id = href(coverImage).replace(/^#/, "");
    const bin = ctx.binaries.get(id);
    if (bin) cover = new Blob([base64ToBytes(bin.data)], { type: bin.mime });
  }

  const bodies = childElements(root, "body");
  const main = bodies.find((b) => !b.getAttribute("name")) ?? bodies[0];
  if (!main) throw new ParseError("В FB2 нет элемента <body>");

  const chapters: ParsedChapter[] = [];
  const topSections = childElements(main, "section");
  const bodyEpigraphs = childElements(main, "epigraph").map((e) => convert(e, ctx)).join("");
  if (topSections.length === 0) {
    const nodes = childElements(main).filter((c) => !["title", "epigraph", "image"].includes(localName(c)));
    splitFlat(nodes, ctx, title, undefined, chapters);
  } else if (topSections.length === 1 && childElements(topSections[0], "section").length > 0 && !titleText(topSections[0])) {
    // A single untitled wrapper section: descend into it.
    for (const s of childElements(topSections[0], "section")) walkSection(s, ctx, undefined, chapters);
  } else {
    for (const s of topSections) walkSection(s, ctx, undefined, chapters);
  }
  if (bodyEpigraphs && chapters[0]) {
    chapters[0].html = compactHtml(bodyEpigraphs + (chapters[0].html ?? ""));
    chapters[0].charCount = textLength(chapters[0].html);
  }

  // Footnotes / comments bodies become a trailing "Примечания" chapter so note links stay reachable.
  for (const extra of bodies.filter((b) => b !== main)) {
    const html = childElements(extra).map((c) => convert(c, ctx)).join("");
    if (textLength(html) > 0) chapters.push(chapterFrom(extra.getAttribute("name") === "comments" ? "Комментарии" : "Примечания", undefined, html));
  }
  if (chapters.length === 0) throw new ParseError("В книге не найдено текста");

  return {
    format: "fb2",
    title,
    author: authors.join(", ") || "Неизвестный автор",
    annotation,
    language,
    cover,
    chapters,
    assets: [...ctx.assets.values()],
    sources: [],
  };
}

export async function parseFb2(file: Blob, fileName: string, onProgress?: ProgressFn): Promise<ParsedBook> {
  onProgress?.(0.05, "Чтение файла");
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    const entry = Object.values(zip.files).find((f) => !f.dir && /\.fb2$/i.test(f.name));
    if (!entry) throw new ParseError("В архиве нет файла .fb2");
    bytes = (await entry.async("uint8array")) as Uint8Array<ArrayBuffer>;
  }
  onProgress?.(0.3, "Определение кодировки");
  const { text } = decodeXml(bytes);
  onProgress?.(0.5, "Разбор глав");
  const book = parseFb2Text(text, fileName);
  book.sources = [{ blob: file, name: fileName, mime: "application/x-fictionbook+xml" }];
  onProgress?.(1);
  return book;
}

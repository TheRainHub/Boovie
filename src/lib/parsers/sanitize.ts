import { allElements } from "./text";

/**
 * Allowlist HTML serializer. Book markup is untrusted: instead of mutating a live DOM we walk the parsed
 * tree and emit only known-safe elements and attributes. Works on XML and HTML documents alike.
 */

export interface SanitizeContext {
  /** Map an image reference to an asset key (or null to drop the image). */
  resolveImage?: (src: string) => string | null;
  /** Map an internal link to an opaque target string (stored in data-link). External links are kept as-is. */
  resolveLink?: (href: string) => string | null;
}

const KEEP = new Set([
  "p", "h1", "h2", "h3", "h4", "h5", "h6", "em", "strong", "b", "i", "u", "s", "del", "ins", "sub", "sup", "small",
  "br", "hr", "blockquote", "q", "cite", "ul", "ol", "li", "dl", "dt", "dd", "pre", "code", "kbd", "samp", "abbr",
  "span", "div", "figure", "figcaption", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "col",
  "colgroup", "mark", "time", "var", "wbr", "ruby", "rt", "rp", "bdi", "bdo", "address",
]);
const RENAME: Record<string, string> = {
  section: "div", article: "div", aside: "aside", header: "div", footer: "div", main: "div", nav: "div",
  hgroup: "div", center: "div", font: "span", big: "span", tt: "code",
};
const DROP = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "link", "meta",
  "head", "title", "noscript", "template", "audio", "video", "canvas", "source", "track", "frame", "frameset", "base",
]);
const VOID = new Set(["br", "hr", "img", "col", "wbr"]);
const SEMANTIC_CLASSES = [
  "epigraph", "poem", "stanza", "verse", "dedication", "footnote", "endnote", "noteref", "text-author", "subtitle",
  "center", "right", "small-caps", "smallcaps", "first", "salutation", "signature", "letter", "note",
];

export function escapeText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, "&quot;");
}

function lname(el: Element): string {
  return (el.localName || el.nodeName).toLowerCase().replace(/^.*:/, "");
}

function semanticClass(el: Element): string {
  const raw = [el.getAttribute("class"), el.getAttribute("epub:type"), el.getAttribute("type"), el.getAttribute("role")]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!raw) return "";
  const out = new Set<string>();
  for (const c of SEMANTIC_CLASSES) if (raw.includes(c)) out.add(c === "smallcaps" ? "small-caps" : c);
  return [...out].join(" ");
}

function attr(el: Element, ...names: string[]): string | null {
  for (const n of names) {
    const v = el.getAttribute(n);
    if (v != null) return v;
  }
  // Namespaced href (xlink:href) when parsed as XML.
  for (const a of Array.from(el.attributes ?? [])) {
    if (names.includes(a.localName) || names.includes(a.name)) return a.value;
  }
  return null;
}

export function serializeChildren(node: Node, ctx: SanitizeContext): string {
  let out = "";
  node.childNodes.forEach((child) => {
    out += serializeNode(child, ctx);
  });
  return out;
}

export function serializeNode(node: Node, ctx: SanitizeContext): string {
  if (node.nodeType === 3 /* TEXT */ || node.nodeType === 4 /* CDATA */) {
    return escapeText(node.nodeValue ?? "");
  }
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const name = lname(el);
  if (DROP.has(name)) return "";

  if (name === "img" || name === "image") {
    const src = attr(el, "src", "href", "xlink:href", "l:href");
    const key = src && ctx.resolveImage ? ctx.resolveImage(src) : null;
    if (!key) return "";
    const alt = el.getAttribute("alt") ?? "";
    return `<img data-asset="${escapeAttr(key)}" alt="${escapeAttr(alt)}">`;
  }
  if (name === "svg") {
    // Common EPUB cover wrapper: <svg><image xlink:href="cover.jpg"/></svg>. Inline SVG drawing is dropped.
    const image = allElements(el).find((c) => lname(c) === "image");
    return image ? `<div class="figure">${serializeNode(image, ctx)}</div>` : "";
  }
  if (name === "math") return `<span class="math">${escapeText(el.textContent ?? "")}</span>`;

  let tag: string | null = KEEP.has(name) ? name : RENAME[name] ?? null;
  if (name === "a") tag = "a";
  if (!tag) return serializeChildren(el, ctx); // unknown wrapper: keep content only

  let attrs = "";
  const cls = semanticClass(el);
  if (cls) attrs += ` class="${cls}"`;
  const id = el.getAttribute("id");
  if (id) attrs += ` data-id="${escapeAttr(id)}"`;
  const lang = el.getAttribute("xml:lang") ?? el.getAttribute("lang");
  if (lang) attrs += ` lang="${escapeAttr(lang)}"`;
  if (tag === "td" || tag === "th") {
    for (const a of ["colspan", "rowspan"]) {
      const v = el.getAttribute(a);
      if (v && /^\d+$/.test(v)) attrs += ` ${a}="${v}"`;
    }
  }
  if (tag === "abbr" || tag === "span") {
    const t = el.getAttribute("title");
    if (t) attrs += ` title="${escapeAttr(t)}"`;
  }
  if (tag === "a") {
    const href = attr(el, "href", "xlink:href", "l:href");
    if (href && /^https?:\/\//i.test(href)) {
      attrs += ` href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer"`;
    } else if (href && ctx.resolveLink) {
      const target = ctx.resolveLink(href);
      if (target) attrs += ` data-link="${escapeAttr(target)}"`;
    }
  }
  if (VOID.has(tag)) return `<${tag}${attrs}>`;
  return `<${tag}${attrs}>${serializeChildren(el, ctx)}</${tag}>`;
}

/** Collapse whitespace-only runs between block tags to keep stored HTML compact. */
export function compactHtml(html: string): string {
  return html.replace(/>\s{2,}</g, "> <").replace(/^\s+|\s+$/g, "");
}

export function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().length;
}

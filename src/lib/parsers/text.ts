/** Encoding detection and small text helpers shared by the parsers. */

export function sniffXmlEncoding(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  let head = "";
  for (let i = 0; i < Math.min(bytes.length, 256); i++) head += String.fromCharCode(bytes[i]);
  const m = /encoding\s*=\s*["']([^"']+)["']/i.exec(head);
  return m ? m[1].trim().toLowerCase() : "utf-8";
}

/**
 * Decode XML bytes honoring the declared encoding (FB2 files are frequently windows-1251 or koi8-r).
 * If a file claims UTF-8 but is not valid UTF-8, fall back to windows-1251 — the most common mislabel.
 */
export function decodeXml(bytes: Uint8Array): { text: string; encoding: string } {
  const declared = sniffXmlEncoding(bytes);
  try {
    const text = new TextDecoder(declared, { fatal: declared === "utf-8" }).decode(bytes);
    return { text, encoding: declared };
  } catch {
    if (declared === "utf-8") {
      return { text: new TextDecoder("windows-1251").decode(bytes), encoding: "windows-1251" };
    }
    return { text: new TextDecoder("utf-8").decode(bytes), encoding: "utf-8" };
  }
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function normalizeSpace(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

export function stripExtension(name: string): string {
  return name.replace(/\.(fb2\.zip|[a-z0-9]{2,5})$/i, "");
}

export function mimeFromName(name: string): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return (
    {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      avif: "image/avif", mp3: "audio/mpeg", m4a: "audio/mp4", m4b: "audio/mp4", mp4: "audio/mp4", aac: "audio/aac",
      ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", wav: "audio/wav", flac: "audio/flac", webm: "audio/webm",
      pdf: "application/pdf", epub: "application/epub+zip", fb2: "application/x-fictionbook+xml", zip: "application/zip",
    } as Record<string, string>
  )[ext] ?? "application/octet-stream";
}

/** Natural, locale-aware comparison: "Глава 2" < "Глава 10", "track9.mp3" < "track10.mp3". */
const collator = new Intl.Collator(["ru", "en"], { numeric: true, sensitivity: "base" });
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b);
}

export function parseXml(text: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  if (!doc.documentElement || !descendants(doc, "parsererror").length) return doc;
  // Malformed XML (unescaped "&" etc.) is common in the wild; the HTML parser is forgiving.
  return parser.parseFromString(text, "text/html");
}

export function localName(el: Element): string {
  return (el.localName || el.nodeName).toLowerCase().replace(/^.*:/, "");
}

export function childElements(el: Element, name?: string): Element[] {
  const out: Element[] = [];
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) {
    if (!name || localName(c) === name) out.push(c);
  }
  return out;
}

export function firstChild(el: Element | null | undefined, name: string): Element | null {
  if (!el) return null;
  for (let c = el.firstElementChild; c; c = c.nextElementSibling) if (localName(c) === name) return c;
  return null;
}

/** Depth-first element walk (independent of getElementsByTagName namespace quirks across DOM implementations). */
export function allElements(root: Element | Document): Element[] {
  const out: Element[] = [];
  const start = "documentElement" in root ? (root as Document).documentElement : (root as Element).firstElementChild;
  const stack: Element[] = [];
  if ("documentElement" in root) {
    if (start) stack.push(start);
  } else {
    for (let c = (root as Element).lastElementChild; c; c = c.previousElementSibling) stack.push(c);
  }
  while (stack.length) {
    const el = stack.pop()!;
    out.push(el);
    for (let c = el.lastElementChild; c; c = c.previousElementSibling) stack.push(c);
  }
  return out;
}

export function descendants(root: Element | Document, name: string): Element[] {
  return allElements(root).filter((e) => localName(e) === name);
}

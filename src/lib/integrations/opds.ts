import { t } from "../i18n";
/**
 * OPDS 1.2 catalog feeds (Atom): navigation entries, acquisition links, covers and paging. Used for Librarr, and
 * works for any OPDS server that allows the request. Takes a DOMParser so tests can pass linkedom's.
 */

export interface OpdsLink {
  href: string;
  type?: string;
  rel?: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  author?: string;
  summary?: string;
  formats: string[];
  /** Download links (rel http://opds-spec.org/acquisition…). */
  acquisitions: OpdsLink[];
  /** Sub-catalog for navigation entries. */
  navigation?: OpdsLink;
  cover?: string;
}

export interface OpdsFeed {
  title: string;
  entries: OpdsEntry[];
  next?: string;
  total?: number;
}

const ACQ = "http://opds-spec.org/acquisition";
const IMAGE = /^http:\/\/opds-spec\.org\/image(\/thumbnail)?$/;

/** Resolve a feed href against the server root (Librarr hands out absolute paths like `/opds/download/12`). */
export function resolveHref(href: string, base: string): string {
  try {
    return new URL(href, base.endsWith("/") ? base : `${base}/`).href;
  } catch {
    return href;
  }
}

function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((c) => c.localName === name || c.tagName === name || c.tagName.endsWith(`:${name}`));
}

function text(el: Element, name: string): string | undefined {
  const c = children(el, name)[0];
  const t = c?.textContent?.replace(/\s+/g, " ").trim();
  return t || undefined;
}

function links(el: Element, base: string): OpdsLink[] {
  return children(el, "link").map((l) => ({ href: resolveHref(l.getAttribute("href") ?? "", base), type: l.getAttribute("type") ?? undefined, rel: l.getAttribute("rel") ?? undefined }));
}

export function parseOpds(xml: string, base: string, parser: DOMParser = new DOMParser()): OpdsFeed {
  const doc = parser.parseFromString(xml, "application/xml");
  const feed = doc.documentElement;
  if (!feed || feed.localName !== "feed") throw new Error(t("Это не каталог OPDS"));
  const entries = children(feed, "entry").map((e, i): OpdsEntry => {
    const ls = links(e, base);
    const acquisitions = ls.filter((l) => l.rel?.startsWith(ACQ));
    const navigation = !acquisitions.length ? ls.find((l) => l.rel === "subsection" || l.type?.includes("profile=opds-catalog") || !l.rel) : undefined;
    const author = children(e, "author").map((a) => text(a, "name")).filter(Boolean).join(", ") || undefined;
    const format = text(e, "format");
    const formats = [...new Set([...(format ? [format] : []), ...acquisitions.map((a) => a.type ?? "")].filter(Boolean))];
    return {
      id: text(e, "id") ?? `entry-${i}`,
      title: text(e, "title") ?? t("Без названия"),
      author,
      summary: text(e, "summary") ?? text(e, "content"),
      formats,
      acquisitions,
      navigation,
      cover: ls.find((l) => l.rel && IMAGE.test(l.rel) && l.rel.endsWith("thumbnail"))?.href ?? ls.find((l) => l.rel && IMAGE.test(l.rel))?.href,
    };
  });
  const next = links(feed, base).find((l) => l.rel === "next")?.href;
  const total = Number(text(feed, "totalResults")) || undefined;
  return { title: text(feed, "title") ?? t("Каталог"), entries, next, total };
}

/** «EPUB», «MP3»… for a MIME type or a Librarr `dc:format`. */
export function formatLabel(type: string): string {
  const mime = type.toLowerCase();
  if (mime.includes("epub")) return "EPUB";
  if (mime.includes("fictionbook") || mime.includes("fb2")) return "FB2";
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("mpeg") || mime === "mp3") return "MP3";
  if (mime.includes("mp4") || mime.includes("m4b") || mime.includes("m4a")) return "M4B";
  if (mime.includes("zip")) return "ZIP";
  if (mime.includes("mobi")) return "MOBI";
  if (mime.includes("cbz") || mime.includes("cbr")) return t("Комикс");
  return mime.split("/").pop()?.toUpperCase() ?? mime;
}

/** Formats Boowie can open (MOBI/AZW3 and comics are listed but not downloadable). */
export function isSupportedType(type: string): boolean {
  return /epub|fictionbook|fb2|pdf|mpeg|mp3|mp4|m4b|m4a|zip|octet-stream/i.test(type) && !/mobi|cbz|cbr|cbt/i.test(type);
}

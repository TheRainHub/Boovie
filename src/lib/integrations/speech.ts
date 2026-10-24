/**
 * Text prepared for speech synthesis: chapter HTML → paragraphs → request-sized pieces that end at sentence
 * boundaries. Pure functions (the HTML step takes a DOMParser so tests can pass linkedom's).
 */

/** Characters per request: well under every model's limit, and short enough to retry cheaply. */
export const SPEECH_CHUNK = 2400;

/** Paragraph texts of a chapter, without footnote markers, images and tables. */
export function chapterParagraphs(html: string, parser: DOMParser = new DOMParser()): string[] {
  const doc = parser.parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  doc.querySelectorAll("sup, script, style, img, table, svg").forEach((el) => el.remove());
  const blocks = doc.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li, dd, dt, blockquote, pre, div");
  const out: string[] = [];
  blocks.forEach((el) => {
    // Only leaf blocks: a <div> or <blockquote> that wraps paragraphs is read through its children.
    if (el.querySelector("h1, h2, h3, h4, h5, h6, p, li, dd, dt, blockquote, pre, div")) return;
    const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  });
  if (!out.length) {
    const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) out.push(text);
  }
  return out;
}

/** Pack paragraphs into pieces of at most `max` characters; long paragraphs split at sentences, then words. */
export function speechChunks(paragraphs: string[], max = SPEECH_CHUNK): string[] {
  const pieces: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= max) {
      pieces.push(p);
      continue;
    }
    let cur = "";
    for (const s of p.split(/(?<=[.!?…»"])\s+/u)) {
      if (s.length > max) {
        for (const w of s.split(/\s+/)) {
          if ((cur + " " + w).trim().length > max && cur) {
            pieces.push(cur.trim());
            cur = "";
          }
          cur = `${cur} ${w}`;
        }
      } else if ((cur + " " + s).trim().length > max && cur) {
        pieces.push(cur.trim());
        cur = s;
      } else cur = `${cur} ${s}`;
    }
    if (cur.trim()) pieces.push(cur.trim());
  }
  const chunks: string[] = [];
  let cur = "";
  for (const piece of pieces) {
    if (cur && cur.length + 2 + piece.length > max) {
      chunks.push(cur);
      cur = piece;
    } else cur = cur ? `${cur}\n\n${piece}` : piece;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

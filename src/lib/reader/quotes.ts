"use client";

/**
 * Quotes in the text reader: a passage is kept by its character offsets in the chapter's text (and its text, to
 * find it again should the offsets not match), and drawn as <mark>s over the chapter's rendered HTML.
 */

export interface QuoteSpot {
  id: string;
  text: string;
  start: number;
  end: number;
}

/** Collapsed whitespace, for comparing a passage with the text. */
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function textNodes(root: Node): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  return out;
}

/** Where a selected range is in `root`'s text, without the whitespace at its ends. */
export function rangeOffsets(root: HTMLElement, range: Range): { text: string; start: number; end: number } | null {
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const raw = range.toString();
  const lead = raw.length - raw.trimStart().length;
  const text = raw.trim();
  if (!text) return null;
  const start = before.toString().length + lead;
  return { text, start, end: start + text.length };
}

/** Wrap [start, end) of `root`'s text in marks for quote `id`. */
function wrap(root: HTMLElement, id: string, start: number, end: number) {
  let pos = 0;
  for (const node of textNodes(root)) {
    const from = pos;
    const to = pos + node.data.length;
    pos = to;
    if (to <= start || from >= end) continue;
    // Skip whitespace-only pieces between blocks (they would draw stray marks).
    let piece = node;
    const a = Math.max(0, start - from);
    const b = Math.min(node.data.length, end - from);
    if (b < piece.data.length) piece.splitText(b);
    if (a > 0) piece = piece.splitText(a);
    if (!piece.data.trim()) continue;
    const mark = document.createElement("mark");
    mark.className = "quote-mark";
    mark.dataset.quote = id;
    piece.parentNode!.insertBefore(mark, piece);
    mark.appendChild(piece);
    if (pos >= end) break;
  }
}

/** Remove the marks drawn before. */
export function clearQuotes(root: HTMLElement) {
  const marks = root.querySelectorAll("mark.quote-mark");
  if (!marks.length) return;
  marks.forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
  root.normalize();
}

/** Draw the chapter's quotes; a quote whose offsets no longer hold its text is looked for by its text. */
export function paintQuotes(root: HTMLElement, quotes: QuoteSpot[]) {
  clearQuotes(root);
  if (!quotes.length) return;
  const full = textNodes(root).map((n) => n.data).join("");
  for (const q of quotes) {
    let { start, end } = q;
    if (norm(full.slice(start, end)) !== norm(q.text)) {
      const at = full.indexOf(q.text);
      if (at < 0) continue;
      start = at;
      end = at + q.text.length;
    }
    wrap(root, q.id, start, end);
  }
}

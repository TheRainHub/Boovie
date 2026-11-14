"use client";

import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, List, Type } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn, IconButton, Slider, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { useProgress, type ChapterMeta } from "@/lib/library/hooks";
import { addBookmark, getChapter, getChapters, journalPosition, markChaptersComplete, removeBookmark, textPercentage, updateProgress } from "@/lib/library/repository";
import { playPageFlip, rustleSpeed, rustleStart, rustleStop } from "@/lib/audio/pageSound";
import { useCoverTone } from "@/lib/covers/tone";
import { constrain, curlFrame, type Pt } from "@/lib/reader/curl";
import { FONT_STACKS, PAPERS, useReaderPrefs } from "@/lib/reader/prefs";
import { shareQuote } from "@/lib/reader/quoteImage";
import { paintQuotes, rangeOffsets } from "@/lib/reader/quotes";
import { recordFinish, recordPage } from "@/lib/stats/activity";
import { useReadingTime } from "@/lib/stats/useReadingTime";
import { getFileUrl } from "@/lib/storage/blobStore";
import type { BookRecord, Bookmark as BookmarkRecord } from "@/lib/storage/types";
import { AmbientButton, AmbientSheet, useAmbientInBook } from "./AmbientSheet";
import { DictionaryCard } from "./DictionaryCard";
import { CurlFlap, paintCurl } from "./PageCurl";
import { QuoteBar, QuoteSheet } from "./Quotes";
import { ReaderChrome } from "./ReaderChrome";
import { TocDrawer } from "./TocDrawer";
import { TypographyDrawer } from "./TypographyDrawer";
import { t } from "@/lib/i18n";

const HEAD = 46; // running header height (px, below the safe area)
const FOOT = 40; // running footer height

/**
 * eBoox-style reader for EPUB/FB2: CSS multi-column pagination (or continuous scroll), tap zones
 * (left 25% back · centre 50% HUD · right 25% forward), swipe, keyboard, and exact position persistence
 * (chapter index + fraction of the chapter) on every page turn.
 */
export function TextReader({
  book, chapters, initialChapter, initialFraction, toggle,
}: {
  book: BookRecord;
  chapters: ChapterMeta[];
  initialChapter: number;
  initialFraction: number;
  toggle?: ReactNode;
}) {
  const prefs = useReaderPrefs();
  const paper = PAPERS[prefs.paper];
  const progress = useProgress(book.id);
  useReadingTime(book.id);
  // Scroll mode counts a page per screen height read further down; the mark only moves forward.
  const readMark = useRef(-1);
  const finishedRef = useRef(false);

  const [chapterIndex, setChapterIndex] = useState(() => Math.min(initialChapter, Math.max(0, chapters.length - 1)));
  const [html, setHtml] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [scrollFrac, setScrollFrac] = useState(0);
  const [hud, setHud] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [typoOpen, setTypoOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [openQuote, setOpenQuote] = useState<BookmarkRecord | null>(null);
  useAmbientInBook();
  const [size, setSize] = useState({ w: 0, h: 0, top: 0, bottom: 0 });

  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const fractionRef = useRef(initialFraction);
  const anchorRef = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number; t: number; swiped: boolean } | null>(null);

  const paged = prefs.mode === "paged";
  // Page geometry. Lines stay at a readable length on tablets; a landscape tablet shows a two-page spread.
  // The text is laid out in CSS columns inside a clipping frame; one screen = `cols` columns, and turning the
  // page shifts the columns by the frame width plus one gutter.
  const spread = paged && size.w >= 900 && size.w > size.h * 1.15;
  const cols = spread ? 2 : 1;
  const gutter = spread ? Math.max(64, prefs.margin * 2) : prefs.margin * 2;
  const colW = Math.max(100, Math.min(spread ? 600 : 680, (size.w - prefs.margin * 2 - (cols - 1) * gutter) / cols));
  const pageW = Math.round(colW * cols + (cols - 1) * gutter);
  const pageLeft = Math.round((size.w - pageW) / 2);
  const stride = pageW + gutter;
  const pageH = Math.max(100, size.h - size.top - size.bottom);
  // One page on the screen: it turns over like paper (unless the slide is chosen). A spread keeps the slide.
  const curlOn = paged && cols === 1 && prefs.turn === "curl";

  // Show the HUD briefly on open so the controls are discoverable, then get out of the way —
  // unless it is already being used.
  const hudTouched = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => !hudTouched.current && setHud(false), 3200);
    return () => clearTimeout(timer);
  }, []);

  // ── Load chapter HTML ──────────────────────────────────────────────────────────────
  const loadChapter = useCallback(async (index: number, fraction: number, anchor?: string) => {
    const rec = await getChapter(book.id, index);
    readMark.current = -1;
    fractionRef.current = fraction;
    anchorRef.current = anchor ?? null;
    setChapterIndex(index);
    setHtml(rec?.contentOrBlobRef ?? `<p>${t("Глава не найдена.")}</p>`);
  }, [book.id]);

  useEffect(() => {
    void loadChapter(chapterIndex, fractionRef.current);
    // Initial load only; later loads go through navigation handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // ── Geometry ──────────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const sat = parseFloat(cs.getPropertyValue("--sat")) || 0;
      const sab = parseFloat(cs.getPropertyValue("--sab")) || 0;
      setSize({ w: el.clientWidth, h: el.clientHeight, top: sat + HEAD, bottom: sab + FOOT });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measure = useCallback(() => {
    const el = content.current;
    if (!el || !size.w) return;
    if (paged) {
      const total = Math.max(1, Math.ceil((el.scrollWidth + gutter) / stride - 0.02));
      setPages(total);
      let target = Math.round(fractionRef.current * (total - 1));
      if (anchorRef.current) {
        const a = el.querySelector(`[data-id="${CSS.escape(anchorRef.current)}"]`) as HTMLElement | null;
        if (a) target = Math.floor(a.offsetLeft / stride);
        anchorRef.current = null;
      }
      setPage(Math.max(0, Math.min(total - 1, target)));
    } else {
      const sc = viewport.current!;
      const max = sc.scrollHeight - sc.clientHeight;
      if (anchorRef.current) {
        const a = el.querySelector(`[data-id="${CSS.escape(anchorRef.current)}"]`) as HTMLElement | null;
        if (a) sc.scrollTop = a.offsetTop;
        anchorRef.current = null;
      } else sc.scrollTop = fractionRef.current * max;
      setScrollFrac(max > 0 ? sc.scrollTop / max : 0);
    }
  }, [gutter, paged, size.w, stride]);

  // Re-paginate when content, typography or viewport change; resolve stored images.
  useLayoutEffect(() => {
    if (html === null) return;
    measure();
    const el = content.current;
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    // The book's own pictures, in the page and in its copy beneath a turning page.
    const imgs = [...(el?.querySelectorAll<HTMLImageElement>("img[data-asset]") ?? []), ...(underContent.current?.querySelectorAll<HTMLImageElement>("img[data-asset]") ?? [])];
    imgs.forEach((img) => {
      if (img.src) return;
      void getFileUrl(img.dataset.asset!).then((u) => {
        if (!u || !alive) return;
        img.onload = () => alive && measure();
        img.src = u;
      });
    });
    return () => {
      alive = false;
    };
  }, [html, measure, prefs.fontSize, prefs.lineHeight, prefs.font, prefs.justify, pageH, pageW, cols, curlOn]);

  // ── Position persistence ───────────────────────────────────────────────────────────
  const fraction = paged ? (pages > 1 ? page / (pages - 1) : 1) : scrollFrac;
  useEffect(() => {
    if (html === null) return;
    fractionRef.current = paged ? (pages > 1 ? page / (pages - 1) : 0) : scrollFrac;
    const timer = setTimeout(() => {
      const pct = textPercentage(chapters, chapterIndex, fractionRef.current);
      void updateProgress(book.id, { currentChapterIndex: chapterIndex, scrollOffsetOrPage: fractionRef.current, percentage: pct });
      if (fraction >= 0.98) void markChaptersComplete(book.id, [chapterIndex]);
      if (pct >= 99.5 && !finishedRef.current) {
        finishedRef.current = true;
        recordFinish(book.id, "read");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [book.id, chapterIndex, chapters, fraction, html, page, pages, paged, scrollFrac]);

  // Leaving the app right after a page turn must not lose it: save at once when the page is hidden.
  const saveNow = useRef<() => void>(() => undefined);
  useEffect(() => {
    saveNow.current = () => {
      if (html === null) return;
      const pos = { currentChapterIndex: chapterIndex, scrollOffsetOrPage: fractionRef.current, percentage: textPercentage(chapters, chapterIndex, fractionRef.current) };
      journalPosition(book.id, pos);
      void updateProgress(book.id, pos);
    };
  });
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && saveNow.current();
    const onPageHide = () => saveNow.current();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  // ── Navigation ────────────────────────────────────────────────────────────────────
  const goChapter = useCallback((index: number, frac = 0, anchor?: string) => {
    if (index < 0 || index >= chapters.length) return;
    if (index > chapterIndex) void markChaptersComplete(book.id, [chapterIndex]);
    setHtml(null);
    void loadChapter(index, frac, anchor);
  }, [book.id, chapterIndex, chapters.length, loadChapter]);

  /** The next page at once (or the next chapter, or the end of the book). */
  const advance = useCallback((keepHud = false) => {
    if (paged && page < pages - 1) {
      setPage(page + 1);
      recordPage(book.id, cols);
    }
    else if (!paged && viewport.current && viewport.current.scrollTop + viewport.current.clientHeight < viewport.current.scrollHeight - 4) {
      viewport.current.scrollBy({ top: viewport.current.clientHeight * 0.9, behavior: "smooth" });
    }
    else if (chapterIndex < chapters.length - 1) {
      if (paged) recordPage(book.id, cols);
      goChapter(chapterIndex + 1, 0);
    }
    else {
      void markChaptersComplete(book.id, [chapterIndex]);
      void updateProgress(book.id, { percentage: 100 });
      finishedRef.current = true;
      recordFinish(book.id, "read");
      toast(t("Книга прочитана до конца"), "success");
    }
    if (!keepHud) setHud(false);
  }, [book.id, chapterIndex, chapters.length, cols, goChapter, page, paged, pages]);

  /** The previous page at once (or the end of the previous chapter). */
  const retreat = useCallback(() => {
    if (paged && page > 0) setPage(page - 1);
    else if (!paged && viewport.current && viewport.current.scrollTop > 4) viewport.current.scrollBy({ top: -viewport.current.clientHeight * 0.9, behavior: "smooth" });
    else if (chapterIndex > 0) goChapter(chapterIndex - 1, 1);
    setHud(false);
  }, [chapterIndex, goChapter, page, paged]);

  // ── Turning a page like paper (lib/reader/curl.ts) ──────────────────────────────────────────────────────────
  // Forward: the page lifts off the next one (shown beneath). Back: the previous page is laid on top, turned away,
  // and comes back over. The corner follows the finger, or a tap sends it over by itself.
  const curlBoxRef = useRef<HTMLDivElement>(null);
  const curlFlapRef = useRef<HTMLDivElement>(null);
  const curlShadeRef = useRef<HTMLDivElement>(null);
  const underContent = useRef<HTMLDivElement>(null);
  const curl = useRef<{ dir: 1 | -1; C: Pt; P: Pt; W: number; H: number; from: number } | null>(null);
  const [turn, setTurn] = useState<{ under: number | null } | null>(null);
  const anim = useRef(0);
  const queued = useRef<1 | -1 | null>(null);
  const paintNow = useCallback(() => {
    const c = curl.current;
    const vp = viewport.current;
    if (!vp) return;
    paintCurl(vp, { boxRef: curlBoxRef, flapRef: curlFlapRef, shadeRef: curlShadeRef }, c ? curlFrame(c.W, c.H, c.C, c.P) : null, paper.dark, c?.W ?? 0, c?.H ?? 0);
  }, [paper.dark]);
  // A turn starting or ending: its first frame (or a clean page) goes with the same paint as the page change.
  useLayoutEffect(() => {
    paintNow();
  }, [turn, paintNow]);

  const beginTurn = (dir: 1 | -1, corner: "top" | "bottom"): boolean => {
    const vp = viewport.current;
    if (!vp || curl.current) return false;
    const W = vp.clientWidth;
    const H = vp.clientHeight;
    const C = { x: W, y: corner === "bottom" ? H : 0 };
    if (dir === 1) {
      // The last page of the book doesn't turn; the last page of a chapter turns onto blank paper.
      if (page >= pages - 1 && chapterIndex >= chapters.length - 1) return false;
      curl.current = { dir, C, P: C, W, H, from: page };
      setTurn({ under: page < pages - 1 ? page + 1 : null });
    } else {
      if (page <= 0) return false;
      curl.current = { dir, C, P: { x: -W, y: C.y }, W, H, from: page };
      setTurn({ under: page });
      setPage(page - 1);
    }
    return true;
  };

  const endTurn = (complete: boolean) => {
    const c = curl.current;
    if (!c) return;
    curl.current = null;
    // The bars were put away when the turn began; a tap meanwhile may have brought them back.
    if (c.dir === 1 && complete) advance(true);
    else if (c.dir === -1 && !complete) setPage(c.from);
    setTurn(null);
  };

  const animateTo = (target: Pt, ms: number, lift: number, done: () => void) => {
    cancelAnimationFrame(anim.current);
    const c = curl.current;
    if (!c) return;
    const from = c.P;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      c.P = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e - Math.sin(Math.PI * e) * lift };
      paintNow();
      if (k < 1) anim.current = requestAnimationFrame(step);
      else {
        anim.current = 0;
        done();
      }
    };
    anim.current = requestAnimationFrame(step);
  };

  const flipSound = (strength = 1) => {
    if (prefs.pageSound) playPageFlip(strength);
  };

  /** A tap, a key or a swipe: the page goes over by itself. */
  const turnPage = (dir: 1 | -1) => {
    if (curl.current) {
      // One turn at a time: the next one follows this one.
      queued.current = dir;
      return;
    }
    if (!curlOn || !beginTurn(dir, "bottom")) {
      const moved = dir === 1 ? paged && (page < pages - 1 || chapterIndex < chapters.length - 1) : paged && (page > 0 || chapterIndex > 0);
      if (moved) flipSound(0.7);
      if (dir === 1) advance();
      else retreat();
      return;
    }
    flipSound();
    setHud(false);
    const c = curl.current!;
    const lift = c.H * 0.12;
    // A frame for the page beneath to show, then over it goes.
    requestAnimationFrame(() => animateTo(dir === 1 ? { x: -c.W, y: c.C.y } : c.C, 480, lift, () => endTurn(true)));
  };
  useEffect(() => {
    if (turn || !queued.current) return;
    const dir = queued.current;
    queued.current = null;
    turnPage(dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, page, html]);

  const next = () => turnPage(1);
  const prev = () => turnPage(-1);
  // The keys reach the latest turn functions without subscribing again on every render.
  const turnKeys = useRef({ next, prev });
  useEffect(() => {
    turnKeys.current = { next, prev };
  });

  // A finger (or a pen, or a mouse from the page's edge) takes the page and bends it.
  const hold = useRef<{ id: number; x0: number; y0: number; on: boolean; lastX: number; lastT: number; vx: number; frame: number } | null>(null);
  const holdMove = (e: React.PointerEvent) => {
    const d = hold.current;
    if (!d || d.id !== e.pointerId || !curlOn) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.on) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const vp = viewport.current;
      if (!vp || window.getSelection()?.toString() || (e.pointerType === "mouse" && d.x0 > vp.clientWidth * 0.15 && d.x0 < vp.clientWidth * 0.85)) {
        hold.current = null;
        return;
      }
      if (!beginTurn(dx < 0 ? 1 : -1, d.y0 > vp.clientHeight / 2 ? "bottom" : "top")) {
        hold.current = null;
        return;
      }
      d.on = true;
      setHud(false);
      if (pointer.current) pointer.current.swiped = true;
      try {
        vp.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone */
      }
      if (prefs.pageSound) rustleStart();
    }
    const c = curl.current;
    if (!c) return;
    const now = performance.now();
    d.vx = ((e.clientX - d.lastX) / Math.max(1, now - d.lastT)) * 0.6 + d.vx * 0.4;
    d.lastX = e.clientX;
    d.lastT = now;
    const raw = c.dir === 1 ? { x: c.C.x + dx, y: c.C.y + dy } : { x: 2 * dx - c.W, y: c.C.y + dy };
    c.P = constrain(raw, c.C, c.W, c.H);
    rustleSpeed(d.vx);
    if (!d.frame) {
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        paintNow();
      });
    }
  };
  const holdEnd = (): boolean => {
    const d = hold.current;
    hold.current = null;
    if (!d?.on) return false;
    if (d.frame) cancelAnimationFrame(d.frame);
    rustleStop();
    const c = curl.current;
    if (!c) return true;
    // A finger that stopped before letting go doesn't flick.
    if (performance.now() - d.lastT > 90) d.vx = 0;
    // Over it goes when brought a quarter of the way, or flicked; back it falls otherwise.
    const progress = c.dir === 1 ? (c.W - c.P.x) / (2 * c.W) : (c.P.x + c.W) / (2 * c.W);
    const flick = c.dir === 1 ? -d.vx : d.vx;
    const complete = flick > 0.35 || (progress > 0.22 && flick > -0.35);
    const target = complete ? (c.dir === 1 ? { x: -c.W, y: c.C.y } : c.C) : c.dir === 1 ? c.C : { x: -c.W, y: c.C.y };
    const left = Math.hypot(target.x - c.P.x, target.y - c.P.y) / (2 * c.W);
    if (complete) flipSound(0.8);
    animateTo(target, Math.max(140, Math.min(420, 520 * left)), 0, () => endTurn(complete));
    return true;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tocOpen || typoOpen || soundOpen || openQuote || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); turnKeys.current.next(); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); turnKeys.current.prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tocOpen, typoOpen, soundOpen, openQuote]);

  const followLink = useCallback(async (target: string) => {
    // EPUB: "ch:N#frag"; FB2 notes: "#noteId" (search all chapters for the anchor).
    const m = /^ch:(\d+)(?:#(.+))?$/.exec(target);
    if (m) return goChapter(Number(m[1]), 0, m[2]);
    const frag = target.replace(/^#/, "");
    const all = await getChapters(book.id);
    const hit = all.find((c) => c.contentOrBlobRef.includes(`data-id="${frag}"`));
    if (hit) goChapter(hit.index, 0, frag);
  }, [book.id, goChapter]);

  // ── Selection: a single word (a long press, a double click) is looked up in the dictionary; a longer passage can
  // be kept as a quote or shared as a picture ─────────────────────────────────────────────────────────────────
  const [lookupFor, setLookupFor] = useState<{ word: string; place: "top" | "bottom" } | null>(null);
  const [quoteSel, setQuoteSel] = useState<{ text: string; start: number; end: number; place: "top" | "bottom" } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSelection = () => {
      clearTimeout(timer);
      // Wait until the selection settles (handles being dragged).
      timer = setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? "";
        if (!sel || !sel.rangeCount || !text) {
          setQuoteSel(null);
          return;
        }
        const range = sel.getRangeAt(0);
        if (!viewport.current?.contains(range.commonAncestorContainer)) return;
        const rect = range.getBoundingClientRect();
        const place = rect.top > window.innerHeight * 0.55 ? "top" : "bottom";
        if (/^[\p{L}][\p{L}\p{M}'’-]{0,39}$/u.test(text)) {
          setQuoteSel(null);
          setLookupFor({ word: text, place });
          return;
        }
        const at = content.current && /\s/.test(text) && text.length <= 4000 ? rangeOffsets(content.current, range) : null;
        if (!at) return;
        setLookupFor(null);
        setQuoteSel({ ...at, place });
      }, 350);
    };
    document.addEventListener("selectionchange", onSelection);
    return () => {
      document.removeEventListener("selectionchange", onSelection);
      clearTimeout(timer);
    };
  }, []);
  const closeLookup = () => {
    setLookupFor(null);
    window.getSelection()?.removeAllRanges();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, t: Date.now(), swiped: false };
    if (curlOn && e.isPrimary) hold.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, lastX: e.clientX, lastT: performance.now(), vx: 0, frame: 0 };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (holdEnd()) return;
    const p = pointer.current;
    if (!p || !paged) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      p.swiped = true;
      if (dx < 0) next();
      else prev();
    }
  };
  const onClick = (e: React.MouseEvent) => {
    if (pointer.current?.swiped) return;
    if (window.getSelection()?.toString()) return;
    const link = (e.target as HTMLElement).closest("a");
    if (link?.dataset.link) {
      e.preventDefault();
      void followLink(link.dataset.link);
      return;
    }
    if (link?.getAttribute("href")) return;
    const x = e.clientX / window.innerWidth;
    const mark = (e.target as HTMLElement).closest<HTMLElement>("mark[data-quote]");
    const tapped = mark && x >= 0.25 && x <= 0.75 ? quotes.find((q) => q.id === mark.dataset.quote) : undefined;
    if (tapped) {
      setOpenQuote(tapped);
      return;
    }
    if (x < 0.25) prev();
    else if (x > 0.75) next();
    else setHud((v) => !v);
  };

  // ── Bookmarks and quotes ─────────────────────────────────────────────────────────────
  const marks = (progress?.bookmarks ?? []).filter((b) => b.kind === "text" && !b.quote);
  const quotes = (progress?.bookmarks ?? [])
    .filter((b) => b.kind === "text" && b.quote)
    .sort((a, b) => a.chapterIndex - b.chapterIndex || a.quote!.start - b.quote!.start);
  // The chapter's quotes, as a string: the marks are drawn again only when they change.
  const spotsKey = JSON.stringify(quotes.filter((q) => q.chapterIndex === chapterIndex).map((q) => ({ id: q.id, ...q.quote! })));
  // A quote to bring into view once its chapter is on the screen.
  const quoteTarget = useRef<string | null>(null);
  const showQuote = useCallback((id: string) => {
    const el = content.current?.querySelector<HTMLElement>(`mark[data-quote="${CSS.escape(id)}"]`);
    if (!el) return false;
    if (paged) setPage(Math.max(0, Math.floor((el.offsetLeft + 1) / stride)));
    else if (viewport.current) viewport.current.scrollTop = Math.max(0, el.getBoundingClientRect().top - viewport.current.getBoundingClientRect().top + viewport.current.scrollTop - size.top - 16);
    return true;
  }, [paged, size.top, stride]);
  useLayoutEffect(() => {
    if (html === null || !content.current) return;
    paintQuotes(content.current, JSON.parse(spotsKey));
    if (underContent.current) paintQuotes(underContent.current, JSON.parse(spotsKey));
    if (quoteTarget.current && showQuote(quoteTarget.current)) quoteTarget.current = null;
  }, [html, paged, curlOn, spotsKey, showQuote]);
  const [sharing, setSharing] = useState(false);
  const tone = useCoverTone(book.coverFileId, book.coverUrl);
  const share = async (text: string) => {
    setSharing(true);
    try {
      await shareQuote({ text, title: book.title, author: book.author, tone });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast(t("Не получилось поделиться картинкой"), "error");
    } finally {
      setSharing(false);
    }
  };
  const saveQuote = async () => {
    if (!quoteSel) return;
    const total = content.current?.textContent?.length || 1;
    await addBookmark(book.id, {
      kind: "text",
      chapterIndex,
      position: Math.min(1, quoteSel.start / total),
      snippet: quoteSel.text.slice(0, 120),
      quote: { text: quoteSel.text, start: quoteSel.start, end: quoteSel.end },
    });
    setQuoteSel(null);
    window.getSelection()?.removeAllRanges();
    toast(t("Цитата сохранена"), "success");
  };
  const tolerance = paged ? 0.5 / Math.max(1, pages - 1) : 0.02;
  const currentMark = marks.find((b) => b.chapterIndex === chapterIndex && Math.abs(b.position - fraction) <= tolerance + 1e-6);

  const toggleBookmark = async () => {
    if (currentMark) {
      await removeBookmark(book.id, currentMark.id);
      return;
    }
    const el = content.current;
    let snippet = "";
    if (el) {
      const blocks = Array.from(el.querySelectorAll<HTMLElement>("p, h1, h2, h3, blockquote"));
      const first = paged
        ? blocks.find((b) => b.offsetLeft >= page * stride - 2 && b.textContent?.trim())
        : blocks.find((b) => b.offsetTop >= (viewport.current?.scrollTop ?? 0) && b.textContent?.trim());
      snippet = (first?.textContent ?? "").trim().slice(0, 120);
    }
    await addBookmark(book.id, { kind: "text", chapterIndex, position: fraction, snippet });
    toast(t("Закладка добавлена"), "success");
  };

  const openBookmark = (b: BookmarkRecord) => {
    setTocOpen(false);
    if (b.quote) {
      if (b.chapterIndex === chapterIndex && showQuote(b.id)) return;
      quoteTarget.current = b.id;
    }
    if (b.chapterIndex === chapterIndex) {
      fractionRef.current = b.position;
      if (paged) setPage(Math.round(b.position * (pages - 1)));
      else if (viewport.current) viewport.current.scrollTop = b.position * (viewport.current.scrollHeight - viewport.current.clientHeight);
    } else goChapter(b.chapterIndex, b.position);
  };

  const chapter = chapters[chapterIndex];
  const percent = textPercentage(chapters, chapterIndex, fraction);
  const completed = new Set(progress?.completedChapters ?? []);

  const vars = {
    "--reader-font": FONT_STACKS[prefs.font],
    "--reader-size": `${prefs.fontSize}px`,
    "--reader-leading": prefs.lineHeight,
    "--reader-align": prefs.justify ? "justify" : "left",
    "--paper-ink": paper.ink,
    "--paper-heading": paper.heading,
    "--paper-muted": paper.muted,
    "--paper-accent": paper.accent,
    "--paper-rule": paper.rule,
    "--page-h": `${pageH}px`,
  } as CSSProperties;

  return (
    <div className="fixed inset-0 select-text" data-paper={paper.dark ? "dark" : "light"} style={{ background: paper.bg, ...vars }}>
      <div
        ref={viewport}
        className={cn("absolute inset-0", paged ? "overflow-hidden" : "overflow-y-auto overscroll-contain")}
        // Turning pages by hand: the page is opaque paper over the next one, and a finger's moves are the page's.
        style={curlOn ? { background: paper.bg, touchAction: "none" } : undefined}
        onPointerDown={onPointerDown}
        // A mouse taking the page by its edge turns it rather than selecting text.
        onMouseDown={curlOn ? (e) => {
          const w = e.currentTarget.clientWidth;
          if (e.clientX < w * 0.15 || e.clientX > w * 0.85) e.preventDefault();
        } : undefined}
        onPointerMove={curlOn ? holdMove : undefined}
        onPointerUp={onPointerUp}
        onPointerCancel={curlOn ? () => void holdEnd() : undefined}
        onClick={onClick}
        onScroll={!paged ? (e) => {
          const sc = e.currentTarget;
          const max = sc.scrollHeight - sc.clientHeight;
          setScrollFrac(max > 0 ? sc.scrollTop / max : 0);
          // A jump of more than two screens is the reader restoring a position, not reading.
          if (readMark.current < 0 || sc.scrollTop - readMark.current > sc.clientHeight * 2) readMark.current = sc.scrollTop;
          while (sc.scrollTop - readMark.current >= sc.clientHeight) {
            recordPage(book.id);
            readMark.current += sc.clientHeight;
          }
        } : undefined}
      >
        {html === null && (
          <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
        )}
        {html !== null && paged && (
          <div className="absolute overflow-hidden" style={{ left: pageLeft, top: size.top, width: pageW, height: pageH }}>
            <div
              ref={content}
              className="book-content"
              style={{
                width: pageW,
                height: pageH,
                columnCount: cols,
                columnGap: gutter,
                columnFill: "auto",
                transform: `translate3d(${-page * stride}px,0,0)`,
                transition: curlOn ? "none" : "transform 280ms cubic-bezier(0.32,0.72,0,1)",
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {spread && <div className="pointer-events-none absolute inset-y-6 left-1/2 w-px -translate-x-1/2" style={{ background: paper.rule }} />}
          </div>
        )}
        {html !== null && !paged && (
          <div style={{ padding: `${size.top}px ${prefs.margin}px ${size.bottom + 24}px` }} className="mx-auto max-w-[760px]">
            <div ref={content} className="book-content" dangerouslySetInnerHTML={{ __html: html }} />
            {chapterIndex < chapters.length - 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); goChapter(chapterIndex + 1, 0); }} className="mx-auto mt-10 flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[15px] font-semibold" style={{ color: paper.heading, border: `1px solid ${paper.rule}` }}>
                {t("Следующая глава")} <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* The page beneath a turning one (drawn under the page): the next page (or, turning back, the one being left);
          blank paper at a chapter's end. Laid out ahead, so a turn starts at once. */}
      {curlOn && html !== null && (
        <div
          className="absolute inset-0 z-[-1]"
          style={{ background: paper.bg, visibility: turn ? "visible" : "hidden" }}
          aria-hidden
          // While a page turns, a tap where it has lifted lands here: it counts like one on the page.
          onPointerDown={(e) => {
            pointer.current = { x: e.clientX, y: e.clientY, t: Date.now(), swiped: false };
          }}
          onClick={onClick}
        >
          <div className="absolute overflow-hidden" style={{ left: pageLeft, top: size.top, width: pageW, height: pageH, visibility: turn && turn.under === null ? "hidden" : undefined }}>
            <div
              ref={underContent}
              className="book-content"
              style={{ width: pageW, height: pageH, columnCount: 1, columnGap: gutter, columnFill: "auto", transform: `translate3d(${-(turn?.under ?? Math.min(page + 1, pages - 1)) * stride}px,0,0)` }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>
      )}
      {/* Running header & footer (always visible, like a printed page) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-end justify-center px-16 text-[13px] font-medium" style={{ height: size.top - 8, color: paper.muted }}>
        <span className="truncate">{chapter?.title}</span>
      </div>
      <div className="tabular pointer-events-none absolute inset-x-0 bottom-0 flex items-start justify-between text-[12px] font-medium" style={{ height: size.bottom, paddingLeft: paged ? pageLeft : prefs.margin, paddingRight: paged ? pageLeft : prefs.margin, paddingTop: 10, color: paper.muted }}>
        <span>{paged ? `${page + 1} / ${pages}` : `${Math.round(scrollFrac * 100)}%`}</span>
        <span>{Math.round(percent)}%</span>
      </div>
      {curlOn && <CurlFlap boxRef={curlBoxRef} flapRef={curlFlapRef} shadeRef={curlShadeRef} paper={paper} />}

      <ReaderChrome
        onTouch={() => (hudTouched.current = true)}
        visible={hud}
        center={toggle ?? <span className="truncate px-2 text-[14px] font-medium">{book.title}</span>}
        actions={
          <>
            <IconButton label={currentMark ? t("Убрать закладку") : t("Добавить закладку")} onClick={() => void toggleBookmark()} className={currentMark ? "text-accent" : undefined}>
              {currentMark ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
            </IconButton>
            <IconButton label={t("Оглавление")} onClick={() => setTocOpen(true)}><List size={20} /></IconButton>
            <AmbientButton onClick={() => setSoundOpen(true)} />
            <IconButton label={t("Оформление")} onClick={() => setTypoOpen(true)}><Type size={19} /></IconButton>
          </>
        }
        bottom={
          <div>
            <div className="flex items-center gap-2">
              <IconButton label={t("Предыдущая глава")} size={32} disabled={chapterIndex === 0} onClick={() => goChapter(chapterIndex - 1, 0)}>
                <ChevronLeft size={18} strokeWidth={1.5} />
              </IconButton>
              <div className="min-w-0 flex-1 text-center">
                <div className="truncate text-[15px] font-bold leading-tight">{chapter?.group ? `${chapter.group} · ` : ""}{chapter?.title}</div>
                <div className="tabular mt-0.5 text-[13px] text-ink-2">
                  {t("Глава {n} из {total}", { n: chapterIndex + 1, total: chapters.length })} · {paged ? t("стр. {n} из {total}", { n: page + 1, total: pages }) : `${Math.round(scrollFrac * 100)}%`} · {t("книга {n}%", { n: Math.round(percent) })}
                </div>
              </div>
              <IconButton label={t("Следующая глава")} size={32} disabled={chapterIndex >= chapters.length - 1} onClick={() => goChapter(chapterIndex + 1, 0)}>
                <ChevronRight size={18} strokeWidth={1.5} />
              </IconButton>
            </div>
            {paged ? (
              pages > 1 && <Slider label={t("Страница главы")} min={0} max={pages - 1} step={1} value={page} onChange={(v) => setPage(Math.round(v))} />
            ) : (
              <Slider label={t("Позиция в главе")} value={scrollFrac} onChange={(v) => {
                const sc = viewport.current;
                if (sc) sc.scrollTop = v * (sc.scrollHeight - sc.clientHeight);
              }} />
            )}
          </div>
        }
      />

      <TocDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        chapters={chapters}
        current={chapterIndex}
        completed={completed}
        bookmarks={marks}
        quotes={quotes}
        onJump={(i) => { setTocOpen(false); goChapter(i, 0); }}
        onBookmark={openBookmark}
        onDeleteBookmark={(b) => void removeBookmark(book.id, b.id)}
      />
      <TypographyDrawer open={typoOpen} onClose={() => setTypoOpen(false)} />
      <AmbientSheet open={soundOpen} onClose={() => setSoundOpen(false)} />
      {lookupFor && <DictionaryCard word={lookupFor.word} place={lookupFor.place} paper={paper} onClose={closeLookup} />}
      {quoteSel && !lookupFor && (
        <QuoteBar
          place={quoteSel.place}
          paper={paper}
          busy={sharing}
          onSave={() => void saveQuote()}
          onShare={() => void share(quoteSel.text)}
          onClose={() => {
            setQuoteSel(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
      <QuoteSheet
        quote={openQuote}
        chapterTitle={openQuote ? chapters[openQuote.chapterIndex]?.title : undefined}
        busy={sharing}
        onClose={() => setOpenQuote(null)}
        onShare={() => openQuote?.quote && void share(openQuote.quote.text)}
        onCopy={() => {
          if (!openQuote?.quote) return;
          void navigator.clipboard?.writeText(`${openQuote.quote.text}\n— ${[book.author, book.title].filter(Boolean).join(", ")}`).then(
            () => toast(t("Скопировано"), "success"),
            () => toast(t("Не получилось скопировать"), "error"),
          );
        }}
        onDelete={() => {
          if (!openQuote) return;
          void removeBookmark(book.id, openQuote.id);
          setOpenQuote(null);
          toast(t("Цитата удалена"));
        }}
      />
    </div>
  );
}

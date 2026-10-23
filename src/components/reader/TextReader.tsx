"use client";

import { Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, List, Type } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn, IconButton, MetalSlider, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { useProgress, type ChapterMeta } from "@/lib/library/hooks";
import { addBookmark, getChapter, getChapters, markChaptersComplete, removeBookmark, textPercentage, updateProgress } from "@/lib/library/repository";
import { FONT_STACKS, PAPERS, useReaderPrefs } from "@/lib/reader/prefs";
import { getFileUrl } from "@/lib/storage/blobStore";
import type { BookRecord, Bookmark as BookmarkRecord } from "@/lib/storage/types";
import { ReaderChrome } from "./ReaderChrome";
import { TocDrawer } from "./TocDrawer";
import { TypographyDrawer } from "./TypographyDrawer";

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

  const [chapterIndex, setChapterIndex] = useState(() => Math.min(initialChapter, Math.max(0, chapters.length - 1)));
  const [html, setHtml] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [scrollFrac, setScrollFrac] = useState(0);
  const [hud, setHud] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [typoOpen, setTypoOpen] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0, top: 0, bottom: 0 });

  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const fractionRef = useRef(initialFraction);
  const anchorRef = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number; t: number; swiped: boolean } | null>(null);

  const paged = prefs.mode === "paged";
  const stride = size.w; // one page = viewport width (page width + 2 × margin)
  const pageW = Math.max(100, size.w - prefs.margin * 2);
  const pageH = Math.max(100, size.h - size.top - size.bottom);

  // Show the HUD briefly on open so the controls are discoverable, then get out of the way.
  useEffect(() => {
    const t = setTimeout(() => setHud(false), 3200);
    return () => clearTimeout(t);
  }, []);

  // ── Load chapter HTML ──────────────────────────────────────────────────────────────
  const loadChapter = useCallback(async (index: number, fraction: number, anchor?: string) => {
    const rec = await getChapter(book.id, index);
    fractionRef.current = fraction;
    anchorRef.current = anchor ?? null;
    setChapterIndex(index);
    setHtml(rec?.contentOrBlobRef ?? "<p>Глава не найдена.</p>");
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
      const total = Math.max(1, Math.round((el.scrollWidth + prefs.margin * 2) / stride));
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
  }, [paged, prefs.margin, size.w, stride]);

  // Re-paginate when content, typography or viewport change; resolve stored images.
  useLayoutEffect(() => {
    if (html === null) return;
    measure();
    const el = content.current;
    let alive = true;
    void document.fonts?.ready.then(() => alive && measure());
    el?.querySelectorAll<HTMLImageElement>("img[data-asset]").forEach((img) => {
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
  }, [html, measure, prefs.fontSize, prefs.lineHeight, prefs.font, prefs.justify, pageH, pageW]);

  // ── Position persistence ───────────────────────────────────────────────────────────
  const fraction = paged ? (pages > 1 ? page / (pages - 1) : 1) : scrollFrac;
  useEffect(() => {
    if (html === null) return;
    fractionRef.current = paged ? (pages > 1 ? page / (pages - 1) : 0) : scrollFrac;
    const t = setTimeout(() => {
      const pct = textPercentage(chapters, chapterIndex, fractionRef.current);
      void updateProgress(book.id, { currentChapterIndex: chapterIndex, scrollOffsetOrPage: fractionRef.current, percentage: pct });
      if (fraction >= 0.98) void markChaptersComplete(book.id, [chapterIndex]);
    }, 350);
    return () => clearTimeout(t);
  }, [book.id, chapterIndex, chapters, fraction, html, page, pages, paged, scrollFrac]);

  // ── Navigation ────────────────────────────────────────────────────────────────────
  const goChapter = useCallback((index: number, frac = 0, anchor?: string) => {
    if (index < 0 || index >= chapters.length) return;
    if (index > chapterIndex) void markChaptersComplete(book.id, [chapterIndex]);
    setHtml(null);
    void loadChapter(index, frac, anchor);
  }, [book.id, chapterIndex, chapters.length, loadChapter]);

  const next = useCallback(() => {
    if (paged && page < pages - 1) setPage(page + 1);
    else if (!paged && viewport.current && viewport.current.scrollTop + viewport.current.clientHeight < viewport.current.scrollHeight - 4) {
      viewport.current.scrollBy({ top: viewport.current.clientHeight * 0.9, behavior: "smooth" });
    }
    else if (chapterIndex < chapters.length - 1) goChapter(chapterIndex + 1, 0);
    else {
      void markChaptersComplete(book.id, [chapterIndex]);
      void updateProgress(book.id, { percentage: 100 });
      toast("Книга прочитана до конца", "success");
    }
    setHud(false);
  }, [book.id, chapterIndex, chapters.length, goChapter, page, paged, pages]);

  const prev = useCallback(() => {
    if (paged && page > 0) setPage(page - 1);
    else if (!paged && viewport.current && viewport.current.scrollTop > 4) viewport.current.scrollBy({ top: -viewport.current.clientHeight * 0.9, behavior: "smooth" });
    else if (chapterIndex > 0) goChapter(chapterIndex - 1, 1);
    setHud(false);
  }, [chapterIndex, goChapter, page, paged]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tocOpen || typoOpen || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); next(); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, tocOpen, typoOpen]);

  const followLink = useCallback(async (target: string) => {
    // EPUB: "ch:N#frag"; FB2 notes: "#noteId" (search all chapters for the anchor).
    const m = /^ch:(\d+)(?:#(.+))?$/.exec(target);
    if (m) return goChapter(Number(m[1]), 0, m[2]);
    const frag = target.replace(/^#/, "");
    const all = await getChapters(book.id);
    const hit = all.find((c) => c.contentOrBlobRef.includes(`data-id="${frag}"`));
    if (hit) goChapter(hit.index, 0, frag);
  }, [book.id, goChapter]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY, t: Date.now(), swiped: false };
  };
  const onPointerUp = (e: React.PointerEvent) => {
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
    if (x < 0.25) prev();
    else if (x > 0.75) next();
    else setHud((v) => !v);
  };

  // ── Bookmarks ─────────────────────────────────────────────────────────────────────
  const marks = (progress?.bookmarks ?? []).filter((b) => b.kind === "text");
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
    toast("Закладка добавлена", "success");
  };

  const openBookmark = (b: BookmarkRecord) => {
    setTocOpen(false);
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
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onClick={onClick}
        onScroll={!paged ? (e) => {
          const sc = e.currentTarget;
          const max = sc.scrollHeight - sc.clientHeight;
          setScrollFrac(max > 0 ? sc.scrollTop / max : 0);
        } : undefined}
      >
        {html === null && (
          <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
        )}
        {html !== null && paged && (
          <div
            ref={content}
            className="book-content absolute"
            style={{
              left: prefs.margin,
              top: size.top,
              width: pageW,
              height: pageH,
              columnWidth: pageW,
              columnGap: prefs.margin * 2,
              columnFill: "auto",
              transform: `translate3d(${-page * stride}px,0,0)`,
              transition: "transform 280ms cubic-bezier(0.32,0.72,0,1)",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
        {html !== null && !paged && (
          <div style={{ padding: `${size.top}px ${prefs.margin}px ${size.bottom + 24}px` }} className="mx-auto max-w-[760px]">
            <div ref={content} className="book-content" dangerouslySetInnerHTML={{ __html: html }} />
            {chapterIndex < chapters.length - 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); goChapter(chapterIndex + 1, 0); }} className="mx-auto mt-10 flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14px] font-medium" style={{ color: paper.heading, border: `1px solid ${paper.rule}` }}>
                Следующая глава <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Running header & footer (always visible, like a printed page) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-end justify-center px-16 text-[12px] tracking-[0.02em]" style={{ height: size.top - 8, color: paper.muted }}>
        <span className="truncate">{chapter?.title}</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-start justify-between tabular text-[11.5px]" style={{ height: size.bottom, paddingLeft: prefs.margin, paddingRight: prefs.margin, paddingTop: 10, color: paper.muted }}>
        <span>{paged ? `${page + 1} / ${pages}` : `${Math.round(scrollFrac * 100)}%`}</span>
        <span>{Math.round(percent)}%</span>
      </div>

      <ReaderChrome
        visible={hud}
        center={toggle ?? <span className="truncate px-2 text-[14px] font-medium">{book.title}</span>}
        actions={
          <>
            <IconButton label={currentMark ? "Убрать закладку" : "Добавить закладку"} onClick={() => void toggleBookmark()} active={!!currentMark}>
              {currentMark ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
            </IconButton>
            <IconButton label="Оглавление" onClick={() => setTocOpen(true)}><List size={20} /></IconButton>
            <IconButton label="Оформление" onClick={() => setTypoOpen(true)}><Type size={19} /></IconButton>
          </>
        }
        bottom={
          <div>
            <div className="flex items-center gap-2">
              <IconButton label="Предыдущая глава" size={32} disabled={chapterIndex === 0} onClick={() => goChapter(chapterIndex - 1, 0)}>
                <ChevronLeft size={18} />
              </IconButton>
              <div className="min-w-0 flex-1 text-center">
                <div className="truncate text-[13px] font-medium">{chapter?.group ? `${chapter.group} · ` : ""}{chapter?.title}</div>
                <div className="text-[11.5px] text-ink-2 tabular">
                  Глава {chapterIndex + 1} из {chapters.length} · {paged ? `стр. ${page + 1} из ${pages}` : `${Math.round(scrollFrac * 100)}% главы`} · {Math.round(percent)}% книги
                </div>
              </div>
              <IconButton label="Следующая глава" size={32} disabled={chapterIndex >= chapters.length - 1} onClick={() => goChapter(chapterIndex + 1, 0)}>
                <ChevronRight size={18} />
              </IconButton>
            </div>
            {paged ? (
              pages > 1 && <MetalSlider label="Страница главы" small min={0} max={pages - 1} step={1} value={page} onChange={(v) => setPage(Math.round(v))} />
            ) : (
              <MetalSlider label="Позиция в главе" small value={scrollFrac} onChange={(v) => {
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
        onJump={(i) => { setTocOpen(false); goChapter(i, 0); }}
        onBookmark={openBookmark}
        onDeleteBookmark={(b) => void removeBookmark(book.id, b.id)}
      />
      <TypographyDrawer open={typoOpen} onClose={() => setTypoOpen(false)} />
    </div>
  );
}

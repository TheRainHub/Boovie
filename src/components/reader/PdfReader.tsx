"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { Bookmark, BookmarkCheck, Contrast, List, ScrollText, BookOpen, ZoomIn, ZoomOut } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn, IconButton, MetalSlider, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { useProgress, type ChapterMeta } from "@/lib/library/hooks";
import { addBookmark, markChaptersComplete, removeBookmark, updateProgress } from "@/lib/library/repository";
import { loadPdfjs, type PdfLib } from "@/lib/pdf/pdfjs";
import { PAPERS, useReaderPrefs } from "@/lib/reader/prefs";
import { getFileBlob } from "@/lib/storage/blobStore";
import type { BookRecord } from "@/lib/storage/types";
import { ReaderChrome } from "./ReaderChrome";
import { TocDrawer } from "./TocDrawer";

const ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3];

/** Renders one PDF page to a HiDPI canvas when `visible`; cancels in-flight renders on change. */
const PdfPage = memo(function PdfPage({
  doc, pageNumber, width, aspect, visible, invert,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  aspect: number;
  visible: boolean;
  invert: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState<string | null>(null);
  const key = `${pageNumber}:${Math.round(width)}`;

  useEffect(() => {
    if (!visible || rendered === key || !canvas.current) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void (async () => {
      const page = await doc.getPage(pageNumber).catch(() => null);
      if (!page || cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      c.width = Math.floor(viewport.width);
      c.height = Math.floor(viewport.height);
      task = page.render({ canvas: c, viewport });
      try {
        await task.promise;
        if (!cancelled) setRendered(key);
      } catch {
        /* cancelled */
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, key, pageNumber, rendered, visible, width]);

  return (
    <div className="relative mx-auto bg-white shadow-[0_2px_12px_rgba(0,0,0,0.18)]" style={{ width, height: width * aspect }} data-page={pageNumber}>
      <canvas ref={canvas} className="block h-full w-full" style={{ filter: invert ? "invert(1) hue-rotate(180deg) brightness(0.92)" : undefined }} />
      {rendered !== key && <div className="absolute inset-0 flex items-center justify-center text-[12px] text-black/40 tabular">{pageNumber}</div>}
    </div>
  );
});

export function PdfReader({ book, chapters, initialPage, toggle }: { book: BookRecord; chapters: ChapterMeta[]; initialPage: number; toggle?: ReactNode }) {
  const prefs = useReaderPrefs();
  const paper = PAPERS[prefs.paper];
  const progress = useProgress(book.id);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1.414);
  const [page, setPage] = useState(Math.max(1, initialPage || 1));
  const [zoom, setZoom] = useState(1);
  const [hud, setHud] = useState(true);
  const [tocOpen, setTocOpen] = useState(false);
  const [width, setWidth] = useState(0);
  const [visibleSet, setVisibleSet] = useState<Set<number>>(() => new Set([page]));
  const scroller = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  // Show the HUD briefly on open so the controls are discoverable, then get out of the way.
  useEffect(() => {
    const t = setTimeout(() => setHud(false), 3200);
    return () => clearTimeout(t);
  }, []);

  const paged = prefs.pdfMode === "paged";
  const invert = prefs.pdfInvert;
  const numPages = doc?.numPages ?? book.pageCount ?? 1;

  const sourceId = book.sourceFileIds[0];
  useEffect(() => {
    let alive = true;
    let task: ReturnType<PdfLib["getDocument"]> | null = null;
    void (async () => {
      try {
        const [lib, blob] = await Promise.all([loadPdfjs(), getFileBlob(sourceId)]);
        if (!blob) throw new Error("Файл PDF не найден на устройстве");
        task = lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        const d = await task.promise;
        const first = await d.getPage(1);
        const vp = first.getViewport({ scale: 1 });
        if (!alive) return;
        setAspect(vp.height / vp.width);
        setDoc(d);
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    })();
    return () => {
      alive = false;
      void task?.destroy();
    };
    // Keyed by the file id: the live book record is a new object after every progress write.
  }, [sourceId]);

  // Fit width to the viewport (capped for tablets), times zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const read = () => {
      const fitW = Math.min(el.clientWidth - 16, 900);
      const fitH = (el.clientHeight - 24) / aspect;
      setWidth(Math.floor((paged ? Math.min(fitW, fitH) : fitW) * zoom));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect, paged, zoom]);

  // Continuous mode: lazy-render pages near the viewport and track the current page.
  useEffect(() => {
    if (paged || !doc || !scroller.current || !width) return;
    const root = scroller.current;
    const io = new IntersectionObserver(
      (entries) => {
        setVisibleSet((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number((e.target as HTMLElement).dataset.page);
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root, rootMargin: "150% 0px" },
    );
    root.querySelectorAll("[data-page]").forEach((n) => io.observe(n));
    const onScroll = () => {
      const mid = root.scrollTop + root.clientHeight * 0.4;
      const gap = 12;
      const h = width * aspect + gap;
      setPage(Math.max(1, Math.min(doc.numPages, Math.floor((mid - 80) / h) + 1)));
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    if (!restored.current) {
      restored.current = true;
      root.scrollTop = (page - 1) * (width * aspect + 12);
    }
    return () => {
      io.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
    // page intentionally excluded: only the initial restore reads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, doc, paged, width]);

  const chapterOf = useCallback((p: number) => {
    let idx = 0;
    chapters.forEach((c, i) => {
      if ((c.startPage ?? 1) <= p) idx = i;
    });
    return idx;
  }, [chapters]);
  const chapterIndex = chapterOf(page);

  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => {
      void updateProgress(book.id, { currentChapterIndex: chapterIndex, scrollOffsetOrPage: page, percentage: (page / numPages) * 100 });
      const done = chapters.filter((c) => (c.endPage ?? 0) < page || page === numPages).map((c) => c.index);
      if (done.length) void markChaptersComplete(book.id, done);
    }, 400);
    return () => clearTimeout(t);
  }, [book.id, chapterIndex, chapters, doc, numPages, page]);

  const goTo = (p: number) => {
    const target = Math.max(1, Math.min(numPages, p));
    setPage(target);
    if (!paged && scroller.current) scroller.current.scrollTop = (target - 1) * (width * aspect + 12);
  };
  const next = () => { goTo(page + 1); setHud(false); };
  const prev = () => { goTo(page - 1); setHud(false); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (tocOpen) return;
      if (paged && ["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); goTo(page + 1); }
      if (paged && ["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); goTo(page - 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onClick = (e: React.MouseEvent) => {
    const x = e.clientX / window.innerWidth;
    if (paged && zoom === 1 && x < 0.25) prev();
    else if (paged && zoom === 1 && x > 0.75) next();
    else setHud((v) => !v);
  };

  const marks = (progress?.bookmarks ?? []).filter((b) => b.kind === "pdf");
  const currentMark = marks.find((b) => b.position === page);
  const toggleMark = async () => {
    if (currentMark) await removeBookmark(book.id, currentMark.id);
    else {
      await addBookmark(book.id, { kind: "pdf", chapterIndex, position: page, snippet: `Страница ${page}` });
      toast(`Закладка · стр. ${page}`, "success");
    }
  };

  return (
    <div className="fixed inset-0" style={{ background: paper.dark ? "#0B0C0E" : "#D9DDE3" }}>
      <div
        ref={scroller}
        className={cn("absolute inset-0 overscroll-contain", paged ? (zoom > 1 ? "overflow-auto" : "overflow-hidden") : "overflow-y-auto")}
        style={{ paddingTop: "calc(var(--sat) + 72px)", paddingBottom: "calc(var(--sab) + 96px)" }}
        onPointerDown={(e) => { pointer.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const p = pointer.current;
          if (!p || !paged || zoom > 1) return;
          const dx = e.clientX - p.x;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - p.y) * 1.3) {
            pointer.current = null;
            if (dx < 0) next();
            else prev();
          }
        }}
        onClick={(e) => pointer.current && onClick(e)}
      >
        {error ? (
          <p className="mt-24 text-center text-[14px] text-ink-2">{error}</p>
        ) : !doc || !width ? (
          <div className="mt-32 flex justify-center"><Spinner /></div>
        ) : paged ? (
          <div className="flex min-h-full items-center justify-center p-2">
            <PdfPage doc={doc} pageNumber={page} width={width} aspect={aspect} visible invert={invert} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-2">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <PdfPage key={i + 1} doc={doc} pageNumber={i + 1} width={width} aspect={aspect} visible={visibleSet.has(i + 1)} invert={invert} />
            ))}
          </div>
        )}
      </div>

      <ReaderChrome
        visible={hud}
        center={toggle ?? <span className="truncate px-2 text-[14px] font-medium">{book.title}</span>}
        actions={
          <>
            <IconButton label={currentMark ? "Убрать закладку" : "Закладка на странице"} active={!!currentMark} onClick={() => void toggleMark()}>
              {currentMark ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
            </IconButton>
            <IconButton label="Оглавление" onClick={() => setTocOpen(true)}><List size={20} /></IconButton>
          </>
        }
        bottom={
          <div>
            <div className="flex items-center gap-1">
              <IconButton label={paged ? "Режим ленты" : "Постраничный режим"} size={34} onClick={() => prefs.set({ pdfMode: paged ? "scroll" : "paged" })}>
                {paged ? <ScrollText size={17} /> : <BookOpen size={17} />}
              </IconButton>
              <IconButton label="Тёмный режим страницы" size={34} active={invert} onClick={() => prefs.set({ pdfInvert: !invert })}>
                <Contrast size={17} />
              </IconButton>
              <div className="min-w-0 flex-1 text-center">
                <div className="truncate text-[13px] font-medium">{chapters[chapterIndex]?.title}</div>
                <div className="text-[11.5px] text-ink-2 tabular">Стр. {page} из {numPages} · {Math.round((page / numPages) * 100)}%</div>
              </div>
              <IconButton label="Уменьшить" size={34} disabled={zoom <= ZOOMS[0]} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}>
                <ZoomOut size={17} />
              </IconButton>
              <span className="w-10 text-center text-[11.5px] text-ink-2 tabular">{Math.round(zoom * 100)}%</span>
              <IconButton label="Увеличить" size={34} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(zoom) + 1)])}>
                <ZoomIn size={17} />
              </IconButton>
            </div>
            <MetalSlider label="Страница" small min={1} max={numPages} step={1} value={page} onChange={(v) => setPage(Math.round(v))} onCommit={(v) => goTo(Math.round(v))} />
          </div>
        }
      />

      <TocDrawer
        open={tocOpen}
        onClose={() => setTocOpen(false)}
        chapters={chapters}
        current={chapterIndex}
        completed={new Set(progress?.completedChapters ?? [])}
        bookmarks={marks}
        pageLabel={(c) => (c.startPage ? `${c.startPage}` : undefined)}
        onJump={(i) => { setTocOpen(false); goTo(chapters[i]?.startPage ?? 1); }}
        onBookmark={(b) => { setTocOpen(false); goTo(b.position); }}
        onDeleteBookmark={(b) => void removeBookmark(book.id, b.id)}
      />
    </div>
  );
}

"use client";

import { Check, Headphones, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/components/ui/primitives";
import { useCoverTone, type Tone } from "@/lib/covers/tone";
import { getLang, t } from "@/lib/i18n";
import type { BookRecord, ProgressRecord } from "@/lib/storage/types";

const GAP = 3;
const ROW_H = 200;
const ADD_W = 34;
/** Room along the spine taken by its bands and marks, top and bottom. */
const ENDS = 46;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A book's length in pages, roughly: characters, PDF pages, or forty pages to an hour of audio. */
function pagesOf(b: BookRecord): number {
  if (b.format === "audio") return b.duration ? (b.duration / 3600) * 40 : 300;
  if (b.format === "pdf") return b.pageCount ?? 250;
  if (b.totalChars) return b.totalChars / 1800;
  return b.fileSize ? b.fileSize / 2500 : 250;
}

/** The spine's size: thicker for a longer book, a height of its own for each title. */
export function spineSize(b: BookRecord): { w: number; h: number } {
  const w = Math.round(Math.min(56, Math.max(22, 17 + Math.sqrt(pagesOf(b)) * 1.35)));
  const h = 160 + (hash(b.title + b.author) % 33);
  return { w, h };
}

/** Spine colours of books whose cover colour isn't known (yet): the store's palette. */
const PALETTE = ["#7A2B30", "#3E2B22", "#3C6762", "#2F4166", "#68673A", "#A3532F", "#5B3A5E", "#8A6A2F"];

const hsl = (h: number, s: number, l: number) => `hsl(${(h * 360).toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

/**
 * The spine's colour: a rich shade of the cover's colour, a light one for a light cover, and a cloth colour of the
 * store's palette for covers without much colour (old paintings are mostly brown) — so a shelf stays colourful.
 */
function spineColors(tone: Tone | null, key: string): { bg: string; ink: string; band: string } {
  const cloth = { bg: PALETTE[hash(key) % PALETTE.length], ink: "#FFF6EA", band: "rgb(255 226 170 / 0.55)" };
  if (!tone) return cloth;
  if (tone.l > 0.66 && (tone.grey || tone.s < 0.5)) return { bg: hsl(tone.grey ? 0.1 : tone.h, tone.grey ? 0.25 : Math.min(0.45, tone.s * 0.7), 0.82), ink: "#2B211A", band: "rgb(110 76 40 / 0.45)" };
  if (tone.grey || tone.s < 0.24) return cloth;
  return {
    bg: hsl(tone.h, Math.max(0.38, Math.min(0.72, tone.s * 1.15)), Math.max(0.24, Math.min(0.4, 0.2 + tone.l * 0.3))),
    ink: "#FFF6EA",
    band: "rgb(255 226 170 / 0.55)",
  };
}

interface Item {
  book: BookRecord;
  w: number;
  h: number;
}

const BOOKEND_W = 20;

/** Spines into rows that fit the shelf's width; the first row starts with «add». `free`: room left at the end. */
function pack(items: Item[], width: number): { items: Item[]; free: number }[] {
  const rows: { items: Item[]; free: number }[] = [{ items: [], free: 0 }];
  let used = ADD_W + GAP;
  for (const it of items) {
    if (used + it.w > width && rows[rows.length - 1].items.length) {
      rows[rows.length - 1].free = width - used;
      rows.push({ items: [], free: 0 });
      used = 0;
    }
    rows[rows.length - 1].items.push(it);
    used += it.w + GAP;
  }
  rows[rows.length - 1].free = width - used;
  return rows;
}

/** A metal bookend holding up the end of a row. */
function Bookend() {
  return (
    <svg width={BOOKEND_W} height="74" viewBox="0 0 20 74" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id="bookend" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#5d5852" />
          <stop offset="0.45" stopColor="#8c857c" />
          <stop offset="1" stopColor="#3e3a36" />
        </linearGradient>
      </defs>
      <path d="M2 74V4a3 3 0 0 1 3-3h1.5a3 3 0 0 1 3 3v64H20v6Z" fill="url(#bookend)" />
    </svg>
  );
}

/**
 * The library as a bookshelf: each book a spine in its cover's colour, as thick as the book is long, standing on
 * wooden shelves. A book being read has a ribbon over the top; a long press (or a right click) opens its menu.
 */
export function Bookshelf({ books, progress, onMenu, onAdd }: {
  books: BookRecord[];
  progress?: Map<string, ProgressRecord>;
  onMenu: (b: BookRecord) => void;
  onAdd: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    // The room for spines: inside the padding and the row's own inset.
    const measure = () => {
      const cs = getComputedStyle(el);
      setWidth(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 8);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const rows = width ? pack(books.map((book) => ({ book, ...spineSize(book) })), width) : [];
  return (
    <div ref={box} className="px-5 pt-5 sm:px-8" data-shelf>
      {rows.map((row, r) => (
        <div key={r} className="mb-5">
          <div className="flex items-end gap-[3px] px-1" style={{ height: ROW_H }}>
            {r === 0 && (
              <button
                type="button"
                onClick={onAdd}
                aria-label={t("Добавить файлы")}
                className="flex h-[170px] shrink-0 items-center justify-center rounded-[4px] border-2 border-dashed border-ink/20 text-ink-2 active:bg-ink/5"
                style={{ width: ADD_W }}
              >
                <Plus size={20} strokeWidth={2.2} />
              </button>
            )}
            {row.items.map((it) => (
              <Spine key={it.book.id} item={it} pct={(progress?.get(it.book.id)?.percentage ?? 0) / 100} onMenu={() => onMenu(it.book)} />
            ))}
            {row.free >= BOOKEND_W + GAP + 2 && <Bookend />}
          </div>
          <div className="shelf-plank h-[14px] rounded-[3px]" />
        </div>
      ))}
    </div>
  );
}

function Spine({ item, pct, onMenu }: { item: Item; pct: number; onMenu: () => void }) {
  const { book, w, h } = item;
  const tone = useCoverTone(book.coverFileId, book.coverUrl);
  const c = spineColors(tone, book.title);
  const reading = pct > 0.005 && pct < 0.995;
  const done = pct >= 0.995;
  const surname = book.author.split(/[,;&]/)[0].trim().split(/\s+/).pop() ?? "";
  // Russian spines read from the bottom up, English ones from the top down.
  const upward = getLang() === "ru";
  const length = h - ENDS - (book.format === "audio" ? 16 : 0) - (done ? 12 : 0);
  // As big as the spine allows, smaller for a long title (but still readable).
  const font = Math.max(9.5, Math.min(14, w * 0.4, length / (Math.max(4, book.title.length) * 0.58)));
  const twoColumns = w >= 40 && !!surname;

  // A long press opens the book's menu instead of the book.
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; x: number; y: number; fired: boolean }>({ x: 0, y: 0, fired: false });
  const cancel = () => clearTimeout(press.current.timer);

  return (
    <Link
      prefetch={false}
      href={`/book/?id=${book.id}`}
      data-spine={book.id}
      aria-label={book.author ? `${book.title} — ${book.author}` : book.title}
      draggable={false}
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY, fired: false, timer: setTimeout(() => {
          press.current.fired = true;
          onMenu();
        }, 520) };
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 8) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onClick={(e) => {
        if (press.current.fired) e.preventDefault();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        cancel();
        if (!press.current.fired) onMenu();
        press.current.fired = true;
      }}
      className="spine relative block shrink-0 select-none rounded-[3px] transition-transform duration-200 hover:-translate-y-1.5 active:-translate-y-1"
      style={{ width: w, height: h, background: c.bg, color: c.ink, "--band": c.band } as CSSProperties}
    >
      {reading && <span className="spine-ribbon absolute -top-[5px] right-[22%] h-[22px] w-[6px]" aria-hidden />}
      <span className="absolute inset-x-0 top-[12px] h-[2px]" style={{ background: c.band }} aria-hidden />
      <span className="absolute inset-x-0 bottom-[12px] h-[2px]" style={{ background: c.band }} aria-hidden />
      {book.format === "audio" && (
        <Headphones size={Math.min(13, w - 10)} strokeWidth={2.2} className="absolute left-1/2 top-[20px] -translate-x-1/2 opacity-80" aria-hidden />
      )}
      {done && <Check size={Math.min(12, w - 10)} strokeWidth={3} className="absolute bottom-[18px] left-1/2 -translate-x-1/2 opacity-85" aria-hidden />}
      <span
        className={cn("absolute inset-x-0 flex items-center justify-center overflow-hidden", book.format === "audio" ? "top-[38px]" : "top-[22px]", done ? "bottom-[34px]" : "bottom-[22px]")}
        aria-hidden
      >
        {/* In vertical writing a column (flex-col) runs across the spine: the title, and the author beside it. */}
        <span
          className="flex h-full flex-col items-center justify-center gap-[3px] whitespace-nowrap leading-[1.1] [writing-mode:vertical-rl]"
          style={{ transform: upward ? "rotate(180deg)" : undefined }}
        >
          <span className="max-h-full truncate font-bold tracking-[0.01em]" style={{ fontSize: font }}>{book.title}</span>
          {twoColumns && <span className="max-h-full truncate font-medium opacity-70" style={{ fontSize: Math.min(11.5, font * 0.85) }}>{surname}</span>}
        </span>
      </span>
    </Link>
  );
}

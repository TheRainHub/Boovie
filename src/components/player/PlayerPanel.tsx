"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookmarkPlus, ChevronFirst, ChevronLast, Gauge, Moon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BookCover } from "@/components/ui/BookCover";
import { cn, IconButton, MetalSlider, ProgressBar, Spinner, Tabs } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import {
  nextChapter, playChapter, prevChapter, RATES, seek, setRate, setSleepTimer, skipBack, skipForward, SLEEP_PRESETS, toggle, usePlayer,
} from "@/lib/audio/player";
import { formatClock, formatDuration } from "@/lib/format";
import { useProgress } from "@/lib/library/hooks";
import { addBookmark, removeBookmark, updateBookmark } from "@/lib/library/repository";
import { PauseGlyph, PlayGlyph, SkipGlyph } from "./icons";

function useNow(active: boolean): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  return now;
}

/**
 * Audible/Tesla-style player: cover, machined scrubber, precision transport, speed, sleep timer,
 * audio bookmarks with notes, and the chapter list with per-chapter progress.
 * Used inside the full-screen sheet and inline on the book screen («Слушать»).
 */
export function PlayerPanel({ variant }: { variant: "sheet" | "inline" }) {
  const p = usePlayer(
    useShallow((s) => ({
      bookId: s.bookId, title: s.title, author: s.author, narrator: s.narrator, cover: s.cover, chapters: s.chapters,
      chapterIndex: s.chapterIndex, position: s.position, duration: s.duration, isPlaying: s.isPlaying, isLoading: s.isLoading,
      rate: s.rate, sleep: s.sleep, error: s.error,
    })),
  );
  const progress = useProgress(p.bookId);
  const [scrub, setScrub] = useState<number | null>(null);
  const [panel, setPanel] = useState<"none" | "speed" | "sleep">("none");
  const [tab, setTab] = useState<"chapters" | "bookmarks">("chapters");
  const now = useNow(p.sleep.kind === "minutes");

  const ch = p.chapters[p.chapterIndex];
  if (!p.bookId || !ch) return null;

  const inChapter = scrub ?? Math.max(0, p.position - ch.startTime);
  const remainingBook = Math.max(0, p.duration - p.position) / p.rate;
  const completed = new Set(progress?.completedChapters ?? []);
  const bookmarks = (progress?.bookmarks ?? []).filter((b) => b.kind === "audio").sort((a, b) => a.position - b.position);
  const sleepLabel = p.sleep.kind === "minutes"
    ? now ? formatClock(Math.max(0, (p.sleep.endsAt - now) / 1000)) : `${p.sleep.minutes} мин`
    : p.sleep.kind === "chapter" ? "Конец гл." : "Сон";

  const onBookmark = async () => {
    await addBookmark(p.bookId!, { kind: "audio", chapterIndex: p.chapterIndex, position: p.position, snippet: ch.title });
    setTab("bookmarks");
    toast(`Закладка · ${formatClock(p.position)}`, "success");
  };

  const key = "flex h-10 items-center justify-center gap-1.5 rounded-[4px] border text-[13px] transition-colors";
  return (
    <div className={cn("mx-auto flex w-full max-w-[520px] flex-col px-6", variant === "sheet" ? "pt-2" : "pt-4")}>
      <div className="num flex items-center gap-2 text-[10.5px] text-ink-3">
        <span>ГЛ. {String(p.chapterIndex + 1).padStart(2, "0")} / {String(p.chapters.length).padStart(2, "0")}</span>
        <span className="h-px flex-1 bg-hairline" />
        <span>{p.rate === 1 ? "1,0×" : `${p.rate.toLocaleString("ru-RU")}×`}</span>
      </div>

      {/* Artwork */}
      <div className="mx-auto mt-5 w-[min(70vw,290px)]">
        <motion.div animate={{ scale: p.isPlaying ? 1 : 0.95 }} transition={{ type: "spring", stiffness: 220, damping: 26 }}>
          <BookCover url={p.cover} title={p.title} author={p.author} square sizes="lg" reflect />
        </motion.div>
      </div>

      {/* Titles */}
      <div className="mt-[58px]">
        {ch.group && <div className="text-[12px] text-ink-3">{ch.group}</div>}
        <h2 className="font-display text-[28px] leading-[1.05]">{ch.title}</h2>
        <p className="mt-1 text-[13.5px] text-ink-2">{p.title} · {p.author}</p>
        {p.narrator && <p className="mt-0.5 text-[12px] text-ink-3">Читает {p.narrator}</p>}
      </div>

      {/* Scrubber */}
      <div className="mt-5">
        <MetalSlider
          label="Позиция в главе"
          value={inChapter}
          max={Math.max(1, ch.duration)}
          onChange={setScrub}
          onCommit={(v) => {
            setScrub(null);
            void seek(ch.startTime + v);
          }}
        />
        <div className="num -mt-0.5 flex justify-between text-[11px] text-ink-2">
          <span>{formatClock(inChapter)}</span>
          <span className="text-ink-3">книга −{formatDuration(remainingBook)}</span>
          <span>−{formatClock(ch.duration - inChapter)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="mt-5 flex items-center justify-between">
        <IconButton label="Предыдущая глава" size={44} onClick={() => void prevChapter()} className="text-ink-2">
          <ChevronFirst size={22} strokeWidth={1.5} />
        </IconButton>
        <IconButton label="Назад на 15 секунд" size={54} onClick={() => void skipBack()}>
          <SkipGlyph seconds={15} direction="back" size={33} />
        </IconButton>
        <button
          type="button"
          aria-label={p.isPlaying ? "Пауза" : "Воспроизвести"}
          onClick={() => toggle()}
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-accent text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_8px_18px_-10px_rgba(15,17,21,0.8)] transition-transform active:scale-[0.96] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_8px_18px_-10px_rgba(0,0,0,0.9)]"
        >
          {p.isLoading ? <Spinner size={24} className="text-on-accent" /> : p.isPlaying ? <PauseGlyph size={30} /> : <PlayGlyph size={30} />}
        </button>
        <IconButton label="Вперёд на 30 секунд" size={54} onClick={() => void skipForward()}>
          <SkipGlyph seconds={30} direction="forward" size={33} />
        </IconButton>
        <IconButton label="Следующая глава" size={44} onClick={() => void nextChapter()} disabled={p.chapterIndex >= p.chapters.length - 1} className="text-ink-2">
          <ChevronLast size={22} strokeWidth={1.5} />
        </IconButton>
      </div>
      {p.error && <p className="mt-3 text-center text-[13px] text-ink-2">{p.error}</p>}

      {/* Option keys */}
      <div className="mt-6 grid grid-cols-3 gap-2">
        <button type="button" className={cn(key, panel === "speed" ? "border-ink text-ink" : "border-ink/20 text-ink-2")} onClick={() => setPanel(panel === "speed" ? "none" : "speed")} aria-expanded={panel === "speed"}>
          <Gauge size={14} strokeWidth={1.6} /> <span className="num text-[11.5px]">{p.rate.toLocaleString("ru-RU", { minimumFractionDigits: 1 })}×</span>
        </button>
        <button type="button" className={cn(key, p.sleep.kind !== "off" || panel === "sleep" ? "border-ink text-ink" : "border-ink/20 text-ink-2")} onClick={() => setPanel(panel === "sleep" ? "none" : "sleep")} aria-expanded={panel === "sleep"}>
          <Moon size={14} strokeWidth={1.6} /> <span className={p.sleep.kind === "minutes" ? "num text-[11.5px]" : undefined}>{sleepLabel}</span>
        </button>
        <button type="button" className={cn(key, "border-ink/20 text-ink-2")} onClick={() => void onBookmark()}>
          <BookmarkPlus size={14} strokeWidth={1.6} /> Закладка
        </button>
      </div>
      <AnimatePresence initial={false}>
        {panel !== "none" && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-[4px] border border-hairline bg-hairline">
              {panel === "speed" &&
                RATES.map((r) => (
                  <button key={r} type="button" onClick={() => { setRate(r); setPanel("none"); }} className={cn("num h-10 text-[12px]", r === p.rate ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>
                    {r.toLocaleString("ru-RU", { minimumFractionDigits: r % 1 ? 2 : 1 })}×
                  </button>
                ))}
              {panel === "sleep" && (
                <>
                  {SLEEP_PRESETS.map((m) => (
                    <button key={m} type="button" onClick={() => { setSleepTimer({ kind: "minutes", minutes: m }); setPanel("none"); toast(`Сон через ${m} мин`); }}
                      className={cn("num h-10 text-[12px]", p.sleep.kind === "minutes" && p.sleep.minutes === m ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>
                      {m} мин
                    </button>
                  ))}
                  <button type="button" onClick={() => { setSleepTimer({ kind: "chapter" }); setPanel("none"); toast("Пауза в конце главы"); }}
                    className={cn("h-10 text-[12.5px]", p.sleep.kind === "chapter" ? "bg-accent text-on-accent" : "bg-surface text-ink-2")}>
                    Конец главы
                  </button>
                  <button type="button" disabled={p.sleep.kind === "off"} onClick={() => { setSleepTimer({ kind: "off" }); setPanel("none"); }} className="h-10 bg-surface text-[12.5px] text-ink-2 disabled:text-ink-3/60">
                    Выкл.
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapters / bookmarks */}
      <Tabs
        className="mt-9"
        layoutKey={`player-tabs-${variant}`}
        value={tab}
        onChange={setTab}
        options={[
          { value: "chapters", label: "Главы", count: p.chapters.length },
          { value: "bookmarks", label: "Закладки", count: bookmarks.length },
        ]}
      />

      {tab === "chapters" ? (
        <ol>
          {p.chapters.map((c) => {
            const current = c.index === p.chapterIndex;
            const done = completed.has(c.index) && !current;
            const frac = current ? Math.min(1, (p.position - c.startTime) / (c.duration || 1)) : done ? 1 : 0;
            return (
              <li key={c.index} className="relative border-b border-hairline">
                {current && <span className="absolute -left-6 top-0 h-full w-[2px] bg-steel" />}
                <button type="button" onClick={() => void playChapter(c.index)} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className={cn("num w-6 shrink-0 text-[11px]", current ? "text-steel" : "text-ink-3")}>{String(c.index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14.5px]", current ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink")}>{c.title}</span>
                    {c.group && <span className="block truncate text-[12px] text-ink-3">{c.group}</span>}
                    {frac > 0 && frac < 1 && <ProgressBar value={frac} ticks={false} className="mt-1" />}
                  </span>
                  <span className="num w-14 shrink-0 text-right text-[11px] text-ink-3">{done ? "✓" : formatClock(c.duration)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : bookmarks.length === 0 ? (
        <p className="py-8 text-center font-display text-[16px] italic text-ink-3">Отмечайте моменты кнопкой «Закладка».</p>
      ) : (
        <ul>
          {bookmarks.map((b) => (
            <li key={b.id} className="flex items-start gap-3 border-b border-hairline py-3">
              <button type="button" className="num mt-0.5 shrink-0 rounded-[3px] border border-ink/20 px-2 py-1 text-[11px]" onClick={() => void seek(b.position, { autoplay: true })}>
                {formatClock(b.position)}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-ink-3">{p.chapters[b.chapterIndex]?.title}</div>
                <input
                  defaultValue={b.note ?? ""}
                  placeholder="Добавить заметку…"
                  aria-label="Заметка к закладке"
                  className="mt-0.5 w-full bg-transparent font-display text-[16px] italic text-ink outline-none placeholder:text-ink-3"
                  onBlur={(e) => e.target.value !== (b.note ?? "") && void updateBookmark(p.bookId!, b.id, { note: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </div>
              <IconButton label="Удалить закладку" size={32} className="text-ink-3" onClick={() => void removeBookmark(p.bookId!, b.id)}>
                <Trash2 size={15} strokeWidth={1.6} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="h-6" />
    </div>
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookmarkPlus, Check, ChevronFirst, ChevronLast, Gauge, ListMusic, Moon, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BookCover } from "@/components/ui/BookCover";
import { cn, Eyebrow, IconButton, MetallicButton, MetalSlider, Segmented, Spinner } from "@/components/ui/primitives";
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
    : p.sleep.kind === "chapter" ? "Конец главы" : "Таймер";

  const onBookmark = async () => {
    await addBookmark(p.bookId!, { kind: "audio", chapterIndex: p.chapterIndex, position: p.position, snippet: ch.title });
    setTab("bookmarks");
    toast(`Закладка · ${formatClock(p.position)}`, "success");
  };

  return (
    <div className={cn("mx-auto flex w-full max-w-[520px] flex-col px-6", variant === "sheet" ? "pt-2" : "pt-4")}>
      {/* Artwork */}
      <div className="mx-auto mt-2 w-[min(72vw,300px)] [perspective:900px]">
        <motion.div
          animate={{ scale: p.isPlaying ? 1 : 0.94, rotateX: p.isPlaying ? 0 : 4 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
        >
          <BookCover url={p.cover} title={p.title} author={p.author} square sizes="lg" reflect />
        </motion.div>
      </div>

      {/* Titles */}
      <div className="mt-[68px] text-center">
        <Eyebrow className="tabular">
          {ch.group ? `${ch.group} · ` : ""}Глава {p.chapterIndex + 1} из {p.chapters.length}
        </Eyebrow>
        <h2 className="mt-1.5 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{ch.title}</h2>
        <p className="mt-1 text-[14px] text-ink-2">{p.title} · {p.author}</p>
        {p.narrator && <p className="mt-0.5 text-[12px] text-ink-3">Читает: {p.narrator}</p>}
      </div>

      {/* Scrubber */}
      <div className="mt-6">
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
        <div className="-mt-0.5 flex justify-between text-[12px] text-ink-2 tabular">
          <span>{formatClock(inChapter)}</span>
          <span>Осталось {formatDuration(remainingBook)}</span>
          <span>−{formatClock(ch.duration - inChapter)}</span>
        </div>
      </div>

      {/* Transport */}
      <div className="mt-5 flex items-center justify-between">
        <IconButton label="Предыдущая глава" size={44} onClick={() => void prevChapter()} className="text-ink-2">
          <ChevronFirst size={24} strokeWidth={1.7} />
        </IconButton>
        <IconButton label="Назад на 15 секунд" size={54} onClick={() => void skipBack()}>
          <SkipGlyph seconds={15} direction="back" size={34} />
        </IconButton>
        <button
          type="button"
          aria-label={p.isPlaying ? "Пауза" : "Воспроизвести"}
          onClick={() => toggle()}
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_24px_-10px_rgba(15,17,21,0.7)] bg-[linear-gradient(180deg,#2E333B_0%,#1E2229_55%,#16191E_100%)] transition-transform active:scale-[0.95] dark:bg-[linear-gradient(180deg,#FAFBFC_0%,#E2E6ED_50%,#BEC5CF_100%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_24px_-10px_rgba(0,0,0,0.9)]"
        >
          {p.isLoading ? <Spinner size={26} className="text-on-accent" /> : p.isPlaying ? <PauseGlyph size={32} /> : <PlayGlyph size={32} />}
        </button>
        <IconButton label="Вперёд на 30 секунд" size={54} onClick={() => void skipForward()}>
          <SkipGlyph seconds={30} direction="forward" size={34} />
        </IconButton>
        <IconButton label="Следующая глава" size={44} onClick={() => void nextChapter()} disabled={p.chapterIndex >= p.chapters.length - 1} className="text-ink-2">
          <ChevronLast size={24} strokeWidth={1.7} />
        </IconButton>
      </div>
      {p.error && <p className="mt-3 text-center text-[13px] text-ink-2">{p.error}</p>}

      {/* Secondary controls */}
      <div className="mt-6 grid grid-cols-3 gap-2 whitespace-nowrap [&>button]:px-2.5">
        <MetallicButton variant="secondary" size="sm" className="h-10 tabular" icon={<Gauge size={15} />} onClick={() => setPanel(panel === "speed" ? "none" : "speed")} aria-expanded={panel === "speed"}>
          {p.rate.toLocaleString("ru-RU")}×
        </MetallicButton>
        <MetallicButton
          variant="secondary"
          size="sm"
          className={cn("h-10 tabular", p.sleep.kind !== "off" && "text-steel")}
          icon={<Moon size={15} />}
          onClick={() => setPanel(panel === "sleep" ? "none" : "sleep")}
          aria-expanded={panel === "sleep"}
        >
          {sleepLabel}
        </MetallicButton>
        <MetallicButton variant="secondary" size="sm" className="h-10" icon={<BookmarkPlus size={15} />} onClick={() => void onBookmark()}>
          Закладка
        </MetallicButton>
      </div>
      <AnimatePresence initial={false}>
        {panel !== "none" && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex flex-wrap justify-center gap-2 pt-3">
              {panel === "speed" &&
                RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => { setRate(r); setPanel("none"); }}
                    className={cn("h-9 min-w-[58px] rounded-full px-3 text-[13px] font-medium tabular", r === p.rate ? "bg-accent text-on-accent" : "metal-card text-ink-2")}
                  >
                    {r.toLocaleString("ru-RU", { minimumFractionDigits: r % 1 ? 2 : 1 })}×
                  </button>
                ))}
              {panel === "sleep" && (
                <>
                  {SLEEP_PRESETS.map((m) => (
                    <button key={m} type="button" onClick={() => { setSleepTimer({ kind: "minutes", minutes: m }); setPanel("none"); toast(`Сон через ${m} мин`); }}
                      className={cn("h-9 rounded-full px-3.5 text-[13px] font-medium tabular", p.sleep.kind === "minutes" && p.sleep.minutes === m ? "bg-accent text-on-accent" : "metal-card text-ink-2")}>
                      {m} мин
                    </button>
                  ))}
                  <button type="button" onClick={() => { setSleepTimer({ kind: "chapter" }); setPanel("none"); toast("Пауза в конце главы"); }}
                    className={cn("h-9 rounded-full px-3.5 text-[13px] font-medium", p.sleep.kind === "chapter" ? "bg-accent text-on-accent" : "metal-card text-ink-2")}>
                    Конец главы
                  </button>
                  {p.sleep.kind !== "off" && (
                    <button type="button" onClick={() => { setSleepTimer({ kind: "off" }); setPanel("none"); }} className="h-9 rounded-full px-3.5 text-[13px] font-medium text-ink-2 metal-card">
                      Выключить
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapters / bookmarks */}
      <div className="mt-8 flex items-center justify-between">
        <Segmented
          size="sm"
          layoutKey={`player-tabs-${variant}`}
          value={tab}
          onChange={setTab}
          options={[
            { value: "chapters", label: `Главы · ${p.chapters.length}`, icon: <ListMusic size={13} /> },
            { value: "bookmarks", label: `Закладки · ${bookmarks.length}` },
          ]}
        />
        <span className="text-[12px] text-ink-3 tabular">{formatDuration(p.duration)}</span>
      </div>

      {tab === "chapters" ? (
        <ol className="mt-3 divide-y divide-hairline">
          {p.chapters.map((c) => {
            const current = c.index === p.chapterIndex;
            const done = completed.has(c.index) && !current;
            const frac = current ? Math.min(1, (p.position - c.startTime) / (c.duration || 1)) : done ? 1 : 0;
            return (
              <li key={c.index}>
                <button type="button" onClick={() => void playChapter(c.index)} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className={cn("w-6 shrink-0 text-[12px] tabular", current ? "text-steel" : "text-ink-3")}>{String(c.index + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14.5px]", current ? "font-semibold" : "text-ink")}>{c.title}</span>
                    {c.group && <span className="block truncate text-[12px] text-ink-3">{c.group}</span>}
                    <span className="mt-1.5 block h-[2px] w-full overflow-hidden rounded-full bg-track">
                      <span className="block h-full bg-steel" style={{ width: `${frac * 100}%` }} />
                    </span>
                  </span>
                  <span className="w-14 shrink-0 text-right text-[12px] text-ink-2 tabular">{formatClock(c.duration)}</span>
                  <span className="w-4 shrink-0">{done && <Check size={14} className="text-steel" />}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-3">
          {bookmarks.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-3">Нажмите «Закладка», чтобы сохранить момент с заметкой.</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {bookmarks.map((b) => (
                <li key={b.id} className="flex items-start gap-3 py-3">
                  <button type="button" className="mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium tabular metal-card" onClick={() => void seek(b.position, { autoplay: true })}>
                    {formatClock(b.position)}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-ink-3">{p.chapters[b.chapterIndex]?.title}</div>
                    <input
                      defaultValue={b.note ?? ""}
                      placeholder="Добавить заметку…"
                      aria-label="Заметка к закладке"
                      className="mt-0.5 w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
                      onBlur={(e) => e.target.value !== (b.note ?? "") && void updateBookmark(p.bookId!, b.id, { note: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  </div>
                  <IconButton label="Удалить закладку" size={32} className="text-ink-3" onClick={() => void removeBookmark(p.bookId!, b.id)}>
                    <Trash2 size={15} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="h-6" />
    </div>
  );
}

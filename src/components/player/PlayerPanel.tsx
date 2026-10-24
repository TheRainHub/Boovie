"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, Check, ChevronDown, ListMusic, Moon, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { BookCover } from "@/components/ui/BookCover";
import { cn, IconButton, ProgressBar, Segmented, Slider, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
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

const rateLabel = (r: number) => `${r.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;

/** «Александр Пушкин» → «Пушкин» for one-line subtitles. */
function surname(author: string): string {
  const words = author.split(/[,;&]/)[0].trim().split(/\s+/);
  return words.length > 1 ? words[words.length - 1] : author;
}

/**
 * The player: a big cover on a screen in its colour, titles, scrubber, transport and pills (speed, sleep timer,
 * chapters, bookmark). Must sit inside an element carrying the cover's tone vars. On a tablet in landscape the
 * cover and the controls stand side by side.
 *  - `sheet`: the full-screen player (chevron to close, chapter count, bookmark on top);
 *  - `inline`: the book screen in «Слушать» mode;
 *  - `home`: the «Слушаю» screen — the book's title leads, the navigation words sit above it.
 */
export function PlayerPanel({ variant, onClose }: { variant: "sheet" | "inline" | "home"; onClose?: () => void }) {
  const p = usePlayer(
    useShallow((s) => ({
      bookId: s.bookId, title: s.title, author: s.author, narrator: s.narrator, cover: s.cover, chapters: s.chapters,
      chapterIndex: s.chapterIndex, position: s.position, duration: s.duration, isPlaying: s.isPlaying, isLoading: s.isLoading,
      rate: s.rate, sleep: s.sleep, error: s.error,
    })),
  );
  const [scrub, setScrub] = useState<number | null>(null);
  const [panel, setPanel] = useState<"none" | "speed" | "sleep">("none");
  const [list, setList] = useState<"none" | "chapters" | "bookmarks">("none");
  const now = useNow(p.sleep.kind === "minutes");

  const ch = p.chapters[p.chapterIndex];
  if (!p.bookId || !ch) return null;

  const home = variant === "home";
  const inChapter = scrub ?? Math.max(0, p.position - ch.startTime);
  const remainingBook = Math.max(0, p.duration - p.position) / p.rate;
  const sleepLabel = p.sleep.kind === "minutes"
    ? now ? formatClock(Math.max(0, (p.sleep.endsAt - now) / 1000)) : `${p.sleep.minutes} мин`
    : p.sleep.kind === "chapter" ? "Конец гл." : "Сон";

  const onBookmark = async () => {
    await addBookmark(p.bookId!, { kind: "audio", chapterIndex: p.chapterIndex, position: p.position, snippet: ch.title });
    toast(`Закладка · ${formatClock(p.position)}`, "success");
  };

  const pill = "inline-flex h-10 items-center justify-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold transition-colors sm:h-11 sm:px-5 sm:text-[15.5px]";
  return (
    <div className="mx-auto flex w-full max-w-[480px] flex-col px-6 text-t-ink sm:max-w-[600px] wide:max-w-[1180px] wide:px-10">
      {!home && (
        <div className="flex h-11 items-center justify-between">
          {variant === "sheet" ? (
            <IconButton label="Свернуть" variant="tonedGhost" size={40} className="-ml-2" onClick={onClose}>
              <ChevronDown size={28} strokeWidth={2.2} />
            </IconButton>
          ) : <span className="w-10" />}
          <span className="tabular text-[13px] font-semibold uppercase tracking-[0.04em] text-t-ink-2">
            Глава {p.chapterIndex + 1} из {p.chapters.length}
          </span>
          <IconButton label="Закладка" variant="tonedGhost" size={40} className="-mr-2" onClick={() => void onBookmark()}>
            <Bookmark size={22} strokeWidth={2.1} />
          </IconButton>
        </div>
      )}

      <div className="wide:grid wide:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] wide:items-center wide:gap-14">
        {/* Artwork */}
        <div className={cn("mx-auto w-[min(84vw,340px)] sm:w-[min(70vw,460px)] wide:w-[min(100%,calc(100dvh-210px))]", home ? "mt-6" : "mt-5 wide:mt-2")}>
          <motion.div animate={{ scale: p.isPlaying ? 1 : 0.94 }} transition={{ type: "spring", stiffness: 220, damping: 26 }}>
            <BookCover url={p.cover} title={p.title} author={p.author} square sizes="lg" shadow={false} className="shadow-[0_26px_50px_-18px_var(--t-shadow)]" />
          </motion.div>
        </div>

        <div className="wide:max-w-[520px]">
          {/* Titles */}
          <div className="mt-8 wide:mt-0">
            {home ? (
              <>
                {ch.group && <div className="truncate text-[13px] font-semibold text-t-ink-2">{ch.group}</div>}
                <h1 className="display line-clamp-2 text-[28px] sm:text-[34px]">{p.title}</h1>
                <p className="mt-0.5 truncate text-[16px] font-medium text-t-ink-2 sm:text-[18px]">{surname(p.author)} · {ch.title}</p>
              </>
            ) : (
              <>
                {ch.group && <div className="truncate text-[13px] font-semibold text-t-ink-2">{ch.group}</div>}
                <h2 className="display line-clamp-2 text-[28px] sm:text-[34px]">{ch.title}</h2>
                <p className="mt-0.5 truncate text-[16px] font-medium text-t-ink-2 sm:text-[18px]">{p.title} · {p.author}</p>
              </>
            )}
            {p.narrator && <p className="truncate text-[13px] text-t-ink-2 sm:text-[14px]">Читает {p.narrator}</p>}
          </div>

          {/* Scrubber */}
          <div className="mt-4">
            <Slider
              label="Позиция в главе"
              value={inChapter}
              max={Math.max(1, ch.duration)}
              onChange={setScrub}
              onCommit={(v) => {
                setScrub(null);
                void seek(ch.startTime + v);
              }}
            />
            <div className="tabular -mt-0.5 flex justify-between gap-2 text-[13px] font-medium text-t-ink-2 sm:text-[14px]">
              <span>{formatClock(inChapter)}</span>
              <span className="truncate">{home ? `Глава ${p.chapterIndex + 1} из ${p.chapters.length} · ` : ""}ещё {formatDuration(remainingBook)}</span>
              <span>−{formatClock(ch.duration - inChapter)}</span>
            </div>
          </div>

          {/* Transport */}
          <div className="mt-5 flex items-center justify-between sm:mt-6">
            <IconButton label="Предыдущая глава" variant="tonedGhost" size={44} onClick={() => void prevChapter()}>
              <SkipBack size={24} fill="currentColor" strokeWidth={1.5} />
            </IconButton>
            <IconButton label="Назад на 15 секунд" variant="tonedGhost" size={56} onClick={() => void skipBack()}>
              <SkipGlyph seconds={15} direction="back" size={40} />
            </IconButton>
            <button
              type="button"
              aria-label={p.isPlaying ? "Пауза" : "Воспроизвести"}
              onClick={() => toggle()}
              className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-t-btn text-t-btn-ink shadow-[0_12px_28px_-12px_var(--t-shadow)] transition-transform active:scale-95 sm:h-[84px] sm:w-[84px]"
            >
              {p.isLoading ? <Spinner size={28} /> : p.isPlaying ? <PauseGlyph size={34} /> : <PlayGlyph size={34} />}
            </button>
            <IconButton label="Вперёд на 30 секунд" variant="tonedGhost" size={56} onClick={() => void skipForward()}>
              <SkipGlyph seconds={30} direction="forward" size={40} />
            </IconButton>
            <IconButton label="Следующая глава" variant="tonedGhost" size={44} onClick={() => void nextChapter()} disabled={p.chapterIndex >= p.chapters.length - 1}>
              <SkipForward size={24} fill="currentColor" strokeWidth={1.5} />
            </IconButton>
          </div>
          {p.error && <p className="mt-3 text-center text-[14px] text-t-ink-2">{p.error}</p>}

          {/* Pills */}
          <div className="mt-7 flex justify-center gap-2">
            <button type="button" aria-label="Скорость" aria-expanded={panel === "speed"} className={cn(pill, panel === "speed" ? "bg-t-btn text-t-btn-ink" : "bg-t-chip")} onClick={() => setPanel(panel === "speed" ? "none" : "speed")}>
              <span className="tabular">{rateLabel(p.rate)}</span>
            </button>
            <button type="button" aria-expanded={panel === "sleep"} className={cn(pill, panel === "sleep" ? "bg-t-btn text-t-btn-ink" : "bg-t-chip")} onClick={() => setPanel(panel === "sleep" ? "none" : "sleep")}>
              <Moon size={16} strokeWidth={2.2} /> <span className={p.sleep.kind === "minutes" ? "tabular" : undefined}>{sleepLabel}</span>
            </button>
            <button type="button" className={cn(pill, "bg-t-chip")} onClick={() => setList("chapters")}>
              <ListMusic size={16} strokeWidth={2.2} /> Главы
            </button>
            {home && (
              <IconButton label="Закладка" variant="tonedSoft" size={40} className="sm:h-11 sm:w-11" onClick={() => void onBookmark()}>
                <Bookmark size={18} strokeWidth={2.2} />
              </IconButton>
            )}
          </div>
          <AnimatePresence initial={false}>
            {panel !== "none" && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {panel === "speed" &&
                    RATES.map((r) => (
                      <button key={r} type="button" onClick={() => { setRate(r); setPanel("none"); }} className={cn("tabular h-11 rounded-full text-[14.5px] font-semibold", r === p.rate ? "bg-t-btn text-t-btn-ink" : "bg-t-chip")}>
                        {rateLabel(r)}
                      </button>
                    ))}
                  {panel === "sleep" && (
                    <>
                      {SLEEP_PRESETS.map((m) => (
                        <button key={m} type="button" onClick={() => { setSleepTimer({ kind: "minutes", minutes: m }); setPanel("none"); toast(`Сон через ${m} мин`); }}
                          className={cn("h-11 rounded-full text-[14.5px] font-semibold", p.sleep.kind === "minutes" && p.sleep.minutes === m ? "bg-t-btn text-t-btn-ink" : "bg-t-chip")}>
                          {m} мин
                        </button>
                      ))}
                      <button type="button" onClick={() => { setSleepTimer({ kind: "chapter" }); setPanel("none"); toast("Пауза в конце главы"); }}
                        className={cn("h-11 rounded-full text-[14.5px] font-semibold", p.sleep.kind === "chapter" ? "bg-t-btn text-t-btn-ink" : "bg-t-chip")}>
                        Конец главы
                      </button>
                      <button type="button" disabled={p.sleep.kind === "off"} onClick={() => { setSleepTimer({ kind: "off" }); setPanel("none"); }} className="h-11 rounded-full bg-t-chip text-[14.5px] font-semibold disabled:opacity-40">
                        Выкл.
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className={home ? "h-2" : "h-8"} />

      <ChaptersSheet tab={list} onTab={setList} />
    </div>
  );
}

/** Chapters with per-chapter progress, and audio bookmarks with notes. */
function ChaptersSheet({ tab, onTab }: { tab: "none" | "chapters" | "bookmarks"; onTab: (t: "none" | "chapters" | "bookmarks") => void }) {
  const p = usePlayer(useShallow((s) => ({ bookId: s.bookId, chapters: s.chapters, chapterIndex: s.chapterIndex, position: s.position })));
  const progress = useProgress(p.bookId);
  const completed = new Set(progress?.completedChapters ?? []);
  const bookmarks = (progress?.bookmarks ?? []).filter((b) => b.kind === "audio").sort((a, b) => a.position - b.position);
  return (
    <Sheet
      open={tab !== "none"}
      onClose={() => onTab("none")}
      title={
        <Segmented
          className="w-full"
          layoutKey="player-list"
          value={tab === "bookmarks" ? "bookmarks" : "chapters"}
          onChange={onTab}
          options={[
            { value: "chapters", label: `Главы · ${p.chapters.length}` },
            { value: "bookmarks", label: `Закладки · ${bookmarks.length}` },
          ]}
        />
      }
    >
      {tab !== "bookmarks" ? (
        <ol className="px-3 pb-4">
          {p.chapters.map((c) => {
            const current = c.index === p.chapterIndex;
            const done = completed.has(c.index) && !current;
            const frac = current ? Math.min(1, (p.position - c.startTime) / (c.duration || 1)) : 0;
            return (
              <li key={c.index}>
                <button
                  type="button"
                  onClick={() => { void playChapter(c.index); onTab("none"); }}
                  className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left", current && "bg-surface-2")}
                >
                  <span className={cn("tabular w-7 shrink-0 text-[15px] font-semibold", current ? "text-ink" : "text-ink-3")}>{c.index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[16px]", current ? "font-bold" : done ? "text-ink-2" : "font-medium")}>{c.title}</span>
                    {c.group && <span className="block truncate text-[13px] text-ink-3">{c.group}</span>}
                    {current && frac > 0 && <ProgressBar value={frac} className="mt-1.5" />}
                  </span>
                  <span className="tabular w-16 shrink-0 text-right text-[14px] text-ink-2">{done ? <Check size={17} className="ml-auto" /> : formatClock(c.duration)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : bookmarks.length === 0 ? (
        <p className="px-6 py-10 text-center text-[16px] text-ink-2">Отмечайте моменты кнопкой с закладкой вверху плеера.</p>
      ) : (
        <ul className="px-5 pb-4">
          {bookmarks.map((b) => (
            <li key={b.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
              <button type="button" className="tabular mt-0.5 shrink-0 rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold" onClick={() => void seek(b.position, { autoplay: true })}>
                {formatClock(b.position)}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-ink-2">{p.chapters[b.chapterIndex]?.title}</div>
                <input
                  defaultValue={b.note ?? ""}
                  placeholder="Добавить заметку…"
                  aria-label="Заметка к закладке"
                  className="mt-0.5 w-full bg-transparent text-[16px] font-medium text-ink outline-none placeholder:text-ink-3"
                  onBlur={(e) => e.target.value !== (b.note ?? "") && void updateBookmark(p.bookId!, b.id, { note: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </div>
              <IconButton label="Удалить закладку" size={34} className="text-ink-3" onClick={() => void removeBookmark(p.bookId!, b.id)}>
                <Trash2 size={16} strokeWidth={1.9} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

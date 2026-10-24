"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { BookCover } from "@/components/ui/BookCover";
import { GlassPanel, IconButton, Spinner } from "@/components/ui/primitives";
import { skipForward, toggle, usePlayer } from "@/lib/audio/player";
import { formatClock } from "@/lib/format";
import { PauseGlyph, PlayGlyph, SkipGlyph } from "./icons";

/** Glass strip docked on top of the navigation bar; its top edge is the chapter's progress line. */
export function MiniPlayer() {
  const s = usePlayer(
    useShallow((p) => ({
      bookId: p.bookId, title: p.title, author: p.author, cover: p.cover, chapters: p.chapters,
      chapterIndex: p.chapterIndex, position: p.position, isPlaying: p.isPlaying, isLoading: p.isLoading, setExpanded: p.setExpanded,
    })),
  );
  const ch = s.chapters[s.chapterIndex];
  const frac = ch && ch.duration ? (s.position - ch.startTime) / ch.duration : 0;

  return (
    <AnimatePresence>
      {s.bookId && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          className="fixed inset-x-0 z-40"
          style={{ bottom: "calc(var(--dock-h) + var(--sab))" }}
        >
          <GlassPanel
            role="button"
            tabIndex={0}
            aria-label="Открыть плеер"
            onClick={() => s.setExpanded(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && s.setExpanded(true)}
            className="relative cursor-pointer rounded-none border-x-0 border-b-0"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-transparent">
              <div className="h-full bg-steel" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
            </div>
            <div className="mx-auto flex h-[var(--mini-h)] max-w-[640px] items-center gap-3 pl-4 pr-2">
              <div className="w-[38px] shrink-0">
                <BookCover url={s.cover} title={s.title} author={s.author} square sizes="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{ch?.title ?? s.title}</div>
                <div className="flex items-baseline gap-2 text-[12px] text-ink-2">
                  <span className="truncate">{s.title}</span>
                  {ch && <span className="num shrink-0 text-[10.5px] text-ink-3">−{formatClock(ch.duration - (s.position - ch.startTime))}</span>}
                </div>
              </div>
              <IconButton
                label={s.isPlaying ? "Пауза" : "Воспроизвести"}
                size={42}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
              >
                {s.isLoading ? <Spinner size={20} /> : s.isPlaying ? <PauseGlyph size={22} /> : <PlayGlyph size={22} />}
              </IconButton>
              <IconButton
                label="Вперёд на 30 секунд"
                size={40}
                className="text-ink-2"
                onClick={(e) => {
                  e.stopPropagation();
                  void skipForward();
                }}
              >
                <SkipGlyph seconds={30} direction="forward" size={25} />
              </IconButton>
            </div>
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

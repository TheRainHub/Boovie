"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/react/shallow";
import { BookCover } from "@/components/ui/BookCover";
import { GlassPanel, IconButton, Spinner } from "@/components/ui/primitives";
import { skipForward, toggle, usePlayer } from "@/lib/audio/player";
import { PauseGlyph, PlayGlyph, SkipGlyph } from "./icons";

/** Floating glass mini player above the dock; tap to expand into the full player sheet. */
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
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-x-0 z-40 flex justify-center px-4"
          style={{ bottom: "calc(var(--dock-h) + var(--sab) + 18px)" }}
        >
          <GlassPanel
            role="button"
            tabIndex={0}
            aria-label="Открыть плеер"
            onClick={() => s.setExpanded(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && s.setExpanded(true)}
            className="relative flex h-[60px] w-full max-w-[420px] cursor-pointer items-center gap-3 overflow-hidden rounded-[20px] pl-2.5 pr-1.5"
          >
            <div className="w-[42px] shrink-0">
              <BookCover url={s.cover} title={s.title} author={s.author} square sizes="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium tracking-[-0.01em]">{ch?.title ?? s.title}</div>
              <div className="truncate text-[12px] text-ink-2">{s.title} · {s.author}</div>
            </div>
            <IconButton
              label={s.isPlaying ? "Пауза" : "Воспроизвести"}
              size={42}
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              {s.isLoading ? <Spinner size={20} /> : s.isPlaying ? <PauseGlyph size={24} /> : <PlayGlyph size={24} />}
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
              <SkipGlyph seconds={30} direction="forward" size={26} />
            </IconButton>
            <div className="absolute inset-x-4 bottom-[3px] h-[2px] overflow-hidden rounded-full bg-track/70">
              <div className="h-full bg-steel" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
            </div>
          </GlassPanel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

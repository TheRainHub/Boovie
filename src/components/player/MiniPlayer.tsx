"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { BookCover } from "@/components/ui/BookCover";
import { IconButton, Spinner } from "@/components/ui/primitives";
import { skipForward, toggle, usePlayer } from "@/lib/audio/player";
import { useToned } from "@/lib/covers/tone";
import { formatClock } from "@/lib/format";
import { useCurrentBook } from "@/lib/library/current";
import { useBook } from "@/lib/library/hooks";
import { PauseGlyph, PlayGlyph, SkipGlyph } from "./icons";
import { t } from "@/lib/i18n";

/**
 * A floating card in the colour of the book that is playing. Hidden on the home screen while that screen
 * already shows the same book with its own controls.
 */
export function MiniPlayer() {
  const pathname = usePathname() ?? "/";
  const s = usePlayer(
    useShallow((p) => ({
      bookId: p.bookId, title: p.title, author: p.author, cover: p.cover, chapters: p.chapters,
      chapterIndex: p.chapterIndex, position: p.position, isPlaying: p.isPlaying, isLoading: p.isLoading, setExpanded: p.setExpanded,
    })),
  );
  const book = useBook(s.bookId);
  const { style } = useToned(book?.coverFileId, book?.coverUrl ?? s.cover, "card");
  const ch = s.chapters[s.chapterIndex];
  const frac = ch && ch.duration ? (s.position - ch.startTime) / ch.duration : 0;
  const current = useCurrentBook();
  const visible = !!s.bookId && !(pathname === "/" && current?.book.id === s.bookId);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 38 }}
          className="fixed inset-x-0 z-40 px-3"
          style={{ bottom: "calc(var(--sab) + 10px)" }}
        >
          <div
            role="button"
            tabIndex={0}
            aria-label={t("Открыть плеер")}
            onClick={() => s.setExpanded(true)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && s.setExpanded(true)}
            className="relative mx-auto flex h-[var(--mini-h)] max-w-[620px] cursor-pointer items-center gap-3 overflow-hidden rounded-[18px] pl-2.5 pr-2 text-t-ink shadow-[0_14px_36px_-12px_rgb(0_0_0/0.55)]"
            style={{ ...style, background: "var(--t-bg)" }}
          >
            <div className="w-[46px] shrink-0">
              <BookCover url={s.cover} title={s.title} author={s.author} square sizes="sm" shadow={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-bold">{s.title}</div>
              <div className="flex items-baseline gap-1.5 text-[13px] text-t-ink-2">
                <span className="truncate">{ch?.title ?? s.author}</span>
                {ch && <span className="tabular shrink-0">· −{formatClock(ch.duration - (s.position - ch.startTime))}</span>}
              </div>
            </div>
            <IconButton
              label={s.isPlaying ? t("Пауза") : t("Воспроизвести")}
              size={42}
              variant="toned"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
            >
              {s.isLoading ? <Spinner size={20} /> : s.isPlaying ? <PauseGlyph size={20} /> : <PlayGlyph size={20} />}
            </IconButton>
            <IconButton
              label={t("Вперёд на 30 секунд")}
              size={42}
              variant="tonedGhost"
              onClick={(e) => {
                e.stopPropagation();
                void skipForward();
              }}
            >
              <SkipGlyph seconds={30} direction="forward" size={26} />
            </IconButton>
            <div className="absolute inset-x-4 bottom-0 h-[3px] overflow-hidden rounded-full bg-t-track">
              <div className="h-full bg-t-btn" style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

"use client";

import { Bookmark as BookmarkIcon, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn, IconButton, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import type { ChapterMeta } from "@/lib/library/hooks";
import type { Bookmark } from "@/lib/storage/types";

/** Table of contents (with completion marks and part groups) + bookmarks. */
export function TocDrawer({
  open, onClose, chapters, current, completed, bookmarks, onJump, onBookmark, onDeleteBookmark, pageLabel,
}: {
  open: boolean;
  onClose: () => void;
  chapters: ChapterMeta[];
  current: number;
  completed: Set<number>;
  bookmarks: Bookmark[];
  onJump: (index: number) => void;
  onBookmark: (b: Bookmark) => void;
  onDeleteBookmark: (b: Bookmark) => void;
  pageLabel?: (c: ChapterMeta) => string | undefined;
}) {
  const [tab, setTab] = useState<"toc" | "marks">("toc");
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={
        <Segmented
          className="w-full"
          layoutKey="toc-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "toc", label: `Оглавление · ${chapters.length}` },
            { value: "marks", label: `Закладки · ${bookmarks.length}` },
          ]}
        />
      }
    >
      {tab === "toc" ? (
        <ol className="px-3 pb-4">
          {chapters.map((c, i) => {
            const header = c.group && c.group !== chapters[i - 1]?.group ? c.group : null;
            const isCurrent = c.index === current;
            const done = completed.has(c.index) && !isCurrent;
            return (
              <li key={c.index}>
                {header && <div className="px-3 pb-1 pt-5 text-[14px] font-bold text-ink-2">{header}</div>}
                <button
                  type="button"
                  onClick={() => onJump(c.index)}
                  className={cn("flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left", isCurrent && "bg-surface-2")}
                >
                  <span className={cn("tabular w-7 shrink-0 text-[15px] font-semibold", isCurrent ? "text-ink" : "text-ink-3")}>{c.index + 1}</span>
                  <span className={cn("min-w-0 flex-1 truncate text-[16px]", isCurrent ? "font-bold text-ink" : done ? "text-ink-2" : "font-medium text-ink")}>
                    {c.title}
                  </span>
                  {pageLabel?.(c) && <span className="tabular shrink-0 text-[13px] text-ink-3">с. {pageLabel(c)}</span>}
                  <span className="flex w-5 shrink-0 justify-end">{done ? <Check size={16} strokeWidth={2.2} className="text-ink-2" /> : null}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : bookmarks.length === 0 ? (
        <p className="px-6 py-10 text-center text-[16px] text-ink-2">Закладок пока нет — отметьте страницу значком в верхней панели.</p>
      ) : (
        <ul className="px-5 pb-4">
          {bookmarks.map((b) => (
            <li key={b.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
              <BookmarkIcon size={17} className="mt-0.5 shrink-0 text-accent" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onBookmark(b)}>
                <div className="text-[13px] text-ink-2">{chapters[b.chapterIndex]?.title}</div>
                <div className="mt-0.5 line-clamp-2 text-[16px] font-medium leading-snug">{b.note || b.snippet || "Закладка"}</div>
              </button>
              <IconButton label="Удалить закладку" size={30} className="text-ink-3" onClick={() => onDeleteBookmark(b)}>
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

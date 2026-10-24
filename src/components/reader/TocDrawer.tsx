"use client";

import { Bookmark as BookmarkIcon, Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { cn, IconButton, Tabs } from "@/components/ui/primitives";
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
        <Tabs
          className="-mb-3 border-b-0"
          layoutKey="toc-tabs"
          value={tab}
          onChange={setTab}
          options={[
            { value: "toc", label: "Оглавление", count: chapters.length },
            { value: "marks", label: "Закладки", count: bookmarks.length },
          ]}
        />
      }
    >
      {tab === "toc" ? (
        <ol className="px-5 pb-4">
          {chapters.map((c, i) => {
            const header = c.group && c.group !== chapters[i - 1]?.group ? c.group : null;
            const isCurrent = c.index === current;
            const done = completed.has(c.index) && !isCurrent;
            return (
              <li key={c.index}>
                {header && <div className="mt-6 border-b border-rule pb-1.5 font-display text-[18px] italic">{header}</div>}
                <button
                  type="button"
                  onClick={() => onJump(c.index)}
                  className="relative flex w-full items-center gap-3 border-b border-hairline py-3 text-left"
                >
                  {isCurrent && <span className="absolute -left-5 top-0 h-full w-[2px] bg-steel" />}
                  <span className={cn("num w-6 shrink-0 text-[10.5px]", isCurrent ? "text-steel" : "text-ink-3")}>{String(c.index + 1).padStart(2, "0")}</span>
                  <span className={cn("min-w-0 flex-1 truncate text-[15px]", isCurrent ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink")}>
                    {c.title}
                  </span>
                  {pageLabel?.(c) && <span className="num shrink-0 text-[10.5px] text-ink-3">с. {pageLabel(c)}</span>}
                  <span className="flex w-5 shrink-0 justify-end">{done ? <Check size={14} strokeWidth={1.8} className="text-steel" /> : null}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : bookmarks.length === 0 ? (
        <p className="px-6 py-10 text-center font-display text-[16px] italic text-ink-3">Закладок пока нет — отметьте страницу значком в верхней панели.</p>
      ) : (
        <ul className="px-5 pb-4">
          {bookmarks.map((b) => (
            <li key={b.id} className="flex items-start gap-3 border-b border-hairline py-3">
              <BookmarkIcon size={15} className="mt-1 shrink-0 text-steel" />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onBookmark(b)}>
                <div className="text-[12px] text-ink-3">{chapters[b.chapterIndex]?.title}</div>
                <div className="mt-0.5 line-clamp-2 font-display text-[16px] italic leading-snug">{b.note || b.snippet || "Закладка"}</div>
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

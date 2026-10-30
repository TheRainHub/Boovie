"use client";

import type { CSSProperties } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { cn } from "@/components/ui/primitives";
import { authorOf, type StoreItem } from "@/data/catalog";
import { formatDuration } from "@/lib/format";
import { t } from "@/lib/i18n";

/** A catalogue entry: the cover, then title and one line of facts (duration or format; «На полке» when owned). */
export function StoreCard({ item, owned, onOpen, rail, index }: { item: StoreItem; owned?: boolean; onOpen: () => void; rail?: boolean; index?: number }) {
  const audio = item.kind === "audiobook";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group block shrink-0 snap-start text-left",
        !rail ? "w-full" : audio ? "w-[132px] sm:w-[164px] md:w-[180px]" : "w-[106px] sm:w-[130px] md:w-[144px]",
        index !== undefined && "rise",
      )}
      style={{ "--i": index ?? 0 } as CSSProperties}
    >
      <div className="transition-transform duration-200 group-active:scale-[0.98]">
        <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="sm" />
      </div>
      <div className="mt-2 line-clamp-2 text-[14px] font-bold leading-[1.2]">{item.title}</div>
      <div className="mt-0.5 truncate text-[13px] text-ink-2">
        {owned ? t("На полке") : audio && item.duration ? formatDuration(item.duration) : `${authorOf(item).split(" ").slice(-1)[0]} · ${item.formatLabel}`}
      </div>
    </button>
  );
}

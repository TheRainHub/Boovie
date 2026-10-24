"use client";

import type { CSSProperties } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { cn } from "@/components/ui/primitives";
import type { StoreItem } from "@/data/catalog";
import { formatDuration } from "@/lib/format";

/** A catalogue entry: the cover, then title and one line of facts (duration or format; «На полке» when owned). */
export function StoreCard({ item, owned, onOpen, width, index }: { item: StoreItem; owned?: boolean; onOpen: () => void; width?: number; index?: number }) {
  const audio = item.kind === "audiobook";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("group block shrink-0 snap-start text-left", !width && "w-full", index !== undefined && "rise")}
      style={{ ...(width ? { width } : {}), "--i": index ?? 0 } as CSSProperties}
    >
      <div className="transition-transform duration-200 group-active:scale-[0.98]">
        <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="sm" />
      </div>
      <div className="mt-2 line-clamp-2 text-[14px] font-bold leading-[1.2]">{item.title}</div>
      <div className="mt-0.5 truncate text-[13px] text-ink-2">
        {owned ? "На полке" : audio && item.duration ? formatDuration(item.duration) : `${item.author.split(" ").slice(-1)[0]} · ${item.formatLabel}`}
      </div>
    </button>
  );
}

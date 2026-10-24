"use client";

import type { CSSProperties } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { cn } from "@/components/ui/primitives";
import type { StoreItem } from "@/data/catalog";
import { formatDuration } from "@/lib/format";

/**
 * A catalogue entry standing on a shelf rail: the cover sits on the rule (bottom-aligned in a fixed bay, so
 * square audiobooks and tall books share one baseline), the caption hangs below it.
 */
export function StoreCard({ item, owned, onOpen, width, index }: { item: StoreItem; owned?: boolean; onOpen: () => void; width?: number; index?: number }) {
  const audio = item.kind === "audiobook";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("group block shrink-0 snap-start text-left", !width && "w-full", index !== undefined && "settle")}
      style={{ ...(width ? { width } : {}), "--i": index ?? 0 } as CSSProperties}
    >
      <div className="shelf flex aspect-[2/3] items-end px-[9%]">
        <div className={cn("w-full transition-transform duration-300 ease-[var(--ease-machined)] group-active:translate-y-px", audio && "w-[112%] -mx-[6%]")}>
          <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="sm" />
        </div>
      </div>
      <div className="px-[9%] pt-2.5">
        <div className="line-clamp-2 text-[13px] leading-[1.25]">{item.title}</div>
        <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{item.author}</div>
        <div className="num mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-3">
          <span>{audio && item.duration ? formatDuration(item.duration) : item.formatLabel}</span>
          <span className="h-px flex-1 bg-hairline" />
          <span className={owned ? "text-steel" : undefined}>{owned ? "на полке" : item.rating.toFixed(1).replace(".", ",")}</span>
        </div>
      </div>
    </button>
  );
}

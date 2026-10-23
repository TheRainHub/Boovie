"use client";

import { CircleCheck, Headphones } from "lucide-react";
import { BookCover } from "@/components/ui/BookCover";
import { cn } from "@/components/ui/primitives";
import type { StoreItem } from "@/data/catalog";
import { formatDuration } from "@/lib/format";

export function StoreCard({ item, owned, onOpen, width }: { item: StoreItem; owned?: boolean; onOpen: () => void; width?: number }) {
  const audio = item.kind === "audiobook";
  return (
    <button type="button" onClick={onOpen} className={cn("group block shrink-0 snap-start text-left", !width && "w-full")} style={width ? { width } : undefined}>
      <div className={cn("relative transition-transform duration-300 ease-[var(--ease-machined)] group-active:scale-[0.97]", audio && "pt-[50%]")}>
        <BookCover
          url={item.coverUrl}
          title={item.title}
          author={item.author}
          square={audio}
          badge={
            owned ? (
              <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md">
                <CircleCheck size={14} />
              </span>
            ) : undefined
          }
        />
      </div>
      <div className="mt-2.5 line-clamp-2 text-[13.5px] font-medium leading-snug tracking-[-0.01em]">{item.title}</div>
      <div className="mt-0.5 truncate text-[12px] text-ink-2">{item.author}</div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-3 tabular">
        {audio && <Headphones size={11} />}
        <span>{audio && item.duration ? formatDuration(item.duration) : item.formatLabel}</span>
        <span>·</span>
        <span>★ {item.rating.toLocaleString("ru-RU")}</span>
      </div>
    </button>
  );
}

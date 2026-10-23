"use client";

import { Headphones } from "lucide-react";
import { useFileUrl } from "@/lib/library/hooks";
import { cn } from "./primitives";

/**
 * Book / audiobook cover with machined finish: soft drop shadow, specular sheen and a spine highlight.
 * Falls back to a typographic graphite plate when a file has no embedded cover.
 */
export function BookCover({
  fileId, url, title, author, square, className, reflect, sizes = "md", badge,
}: {
  fileId?: string;
  url?: string;
  title: string;
  author?: string;
  square?: boolean;
  className?: string;
  reflect?: boolean;
  sizes?: "sm" | "md" | "lg";
  badge?: React.ReactNode;
}) {
  const src = useFileUrl(fileId, url);
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-surface-2 shadow-[var(--cover-shadow)]",
        square ? "aspect-square" : "aspect-[2/3]",
        sizes === "sm" ? "rounded-[6px]" : sizes === "lg" ? "rounded-[14px]" : "rounded-[9px]",
        reflect && "cover-reflect",
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URLs and static export (no image optimizer)
        <img src={src} alt={title} className="absolute inset-0 h-full w-full object-cover" draggable={false} loading="lazy" />
      ) : (
        <div className="brushed absolute inset-0 flex flex-col justify-between bg-[linear-gradient(165deg,#3A3F47_0%,#15171B_100%)] p-[9%] text-[#ECEFF4]">
          <div className="truncate text-[9px] font-medium uppercase tracking-[0.16em] opacity-60">{author}</div>
          {square && <Headphones className="mx-auto opacity-50" size={sizes === "sm" ? 14 : 28} strokeWidth={1.4} />}
          <div className={cn("line-clamp-4 font-semibold leading-[1.05] tracking-[-0.02em]", sizes === "sm" ? "text-[10px]" : sizes === "lg" ? "text-[22px]" : "text-[14px]")}>{title}</div>
        </div>
      )}
      {/* Specular sheen + spine */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0.04)_28%,transparent_45%,transparent_80%,rgba(255,255,255,0.06)_100%)]" />
      {!square && <div className="pointer-events-none absolute inset-y-0 left-0 w-[5%] bg-[linear-gradient(90deg,rgba(0,0,0,0.22),rgba(255,255,255,0.12)_45%,transparent)]" />}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10 dark:ring-white/10" />
      {badge}
    </div>
  );
}

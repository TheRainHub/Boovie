"use client";

import { useState } from "react";
import { useFileUrl } from "@/lib/library/hooks";
import { cn } from "./primitives";

/**
 * A cover as a physical object: near-square corners, a tight contact shadow plus a long soft drop, and a
 * spine crease for books. Falls back to a typeset graphite plate when there is no image (or it fails offline).
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
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && failed !== src;
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-surface-2 shadow-[var(--cover-shadow)]",
        square ? "aspect-square rounded-[3px]" : "aspect-[2/3] rounded-[2px]",
        reflect && "cover-reflect",
        className,
      )}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URLs and static export (no image optimizer)
        <img src={src} alt={title} className="absolute inset-0 h-full w-full object-cover" draggable={false} loading="lazy" onError={() => setFailed(src)} />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(165deg,#3A3F47_0%,#15171B_100%)] p-[9%] text-[#ECEFF4]">
          <div className="truncate font-display text-[10px] italic opacity-70">{author}</div>
          <div className={cn("line-clamp-4 font-display leading-[1.05]", sizes === "sm" ? "text-[11px]" : sizes === "lg" ? "text-[26px]" : "text-[16px]")}>{title}</div>
        </div>
      )}
      {!square && <div className="pointer-events-none absolute inset-y-0 left-[3.5%] w-px bg-black/25 shadow-[1px_0_0_rgba(255,255,255,0.18)]" />}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10 dark:ring-white/10" />
      {badge}
    </div>
  );
}

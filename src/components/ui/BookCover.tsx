"use client";

import { useState } from "react";
import { useFileUrl } from "@/lib/library/hooks";
import { cn } from "./primitives";

/** Earthy grounds for books without a cover image (picked deterministically from the title). */
const PLATES = ["#8E4A2E", "#6E2A31", "#5C5B33", "#2F5A55", "#2E3F63", "#7A5A2A", "#4E3A2E", "#3B5240"];

function plateFor(title: string): string {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) h = Math.imul(h ^ title.charCodeAt(i), 16777619);
  return PLATES[(h >>> 0) % PLATES.length];
}

/** A cover with soft rounded corners and a contact shadow; falls back to a typeset plate (also offline). */
export function BookCover({
  fileId, url, title, author, square, className, sizes = "md", badge, shadow = true,
}: {
  fileId?: string;
  url?: string;
  title: string;
  author?: string;
  square?: boolean;
  className?: string;
  sizes?: "sm" | "md" | "lg";
  badge?: React.ReactNode;
  shadow?: boolean;
}) {
  const src = useFileUrl(fileId, url);
  const [failed, setFailed] = useState<string | null>(null);
  const show = src && failed !== src;
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-surface-2",
        square ? "aspect-square" : "aspect-[2/3]",
        sizes === "sm" ? "rounded-[5px]" : "rounded-[8px]",
        shadow && "shadow-[var(--cover-shadow)]",
        className,
      )}
    >
      {show ? (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URLs and static export (no image optimizer)
        <img src={src} alt={title} className="absolute inset-0 h-full w-full object-cover" draggable={false} loading="lazy" onError={() => setFailed(src)} />
      ) : (
        <div className="absolute inset-0 flex flex-col justify-between p-[10%] text-[#FFFAF3]" style={{ background: `linear-gradient(160deg, ${plateFor(title)} 0%, #140F0C 140%)` }}>
          <div className={cn("truncate font-medium opacity-70", sizes === "sm" ? "text-[8px]" : "text-[11px]")}>{author}</div>
          <div className={cn("line-clamp-4 font-bold leading-[1.05] tracking-[-0.01em]", sizes === "sm" ? "text-[11px]" : sizes === "lg" ? "text-[26px]" : "text-[16px]")}>{title}</div>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/[0.08] dark:ring-white/[0.08]" />
      {badge}
    </div>
  );
}

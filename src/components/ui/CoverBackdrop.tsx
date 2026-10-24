"use client";

import { useFileUrl } from "@/lib/library/hooks";
import { cn } from "./primitives";

/**
 * The cover itself, blown up and blurred, under the cover-coloured gradient: the screen feels like the book.
 * Sits behind the content of a toned element (needs the `--t-bg` var from lib/covers/tone).
 */
export function CoverBackdrop({ fileId, url, fixed, className }: { fileId?: string; url?: string; fixed?: boolean; className?: string }) {
  const src = useFileUrl(fileId, url);
  return (
    <div aria-hidden className={cn("pointer-events-none inset-0 -z-10 overflow-hidden", fixed ? "fixed" : "absolute", className)} style={{ background: "var(--t-bg)" }}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: URLs, decorative
        <img src={src} alt="" className="absolute left-1/2 top-[-12%] h-[78%] w-[150%] max-w-none -translate-x-1/2 object-cover opacity-80 blur-[56px] saturate-[1.35]" />
      )}
      <div className="absolute inset-0" style={{ background: "var(--t-bg)", opacity: 0.72 }} />
    </div>
  );
}

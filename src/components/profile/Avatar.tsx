"use client";

import { UserRound } from "lucide-react";
import { cn } from "@/components/ui/primitives";
import type { AccountUser } from "@/lib/account/identity";

/** The account's initial in a circle, or a person glyph when nobody is signed in. */
export function Avatar({ user, size = 36, toned, className }: { user: AccountUser | null; size?: number; toned?: boolean; className?: string }) {
  const initial = user?.name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        initial ? (toned ? "bg-t-btn text-t-btn-ink" : "bg-accent text-bg") : toned ? "bg-t-chip text-t-ink" : "bg-surface-2 text-ink",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      {initial ?? <UserRound size={size * 0.52} strokeWidth={2} />}
    </span>
  );
}

"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, GlassPanel } from "@/components/ui/primitives";

const TABS = [
  { href: "/", label: "Полка", match: (p: string) => p === "/" },
  { href: "/store/", label: "Магазин", match: (p: string) => p.startsWith("/store") },
  { href: "/settings/", label: "Настройки", match: (p: string) => p.startsWith("/settings") },
];

/** Glass instrument strip along the bottom edge: three ruled keys, the active one marked by a steel bar. */
export function BottomDock() {
  const pathname = usePathname() ?? "/";
  return (
    <GlassPanel
      as="nav"
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-40 rounded-none border-x-0 border-b-0 pb-[var(--sab)]"
    >
      <div className="mx-auto flex h-[var(--dock-h)] max-w-[640px] items-stretch">
        {TABS.map(({ href, label, match }, i) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-2 text-[13.5px] transition-colors",
                i > 0 && "border-l border-hairline",
                active ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {active && <motion.span layoutId="dock-active" transition={{ type: "spring", stiffness: 520, damping: 42 }} className="absolute inset-x-6 top-0 h-[2px] bg-steel" />}
              <span className="num text-[10px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <span className={active ? "font-medium" : undefined}>{label}</span>
            </Link>
          );
        })}
      </div>
    </GlassPanel>
  );
}

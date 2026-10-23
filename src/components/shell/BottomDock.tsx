"use client";

import { motion } from "framer-motion";
import { LibraryBig, Settings2, Store } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, GlassPanel } from "@/components/ui/primitives";

const TABS = [
  { href: "/", label: "Моя полка", icon: LibraryBig, match: (p: string) => p === "/" },
  { href: "/store/", label: "Магазин", icon: Store, match: (p: string) => p.startsWith("/store") },
  { href: "/settings/", label: "Настройки", icon: Settings2, match: (p: string) => p.startsWith("/settings") },
];

export function BottomDock() {
  const pathname = usePathname() ?? "/";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(var(--sab)+10px)]">
      <GlassPanel as="nav" aria-label="Основная навигация" className="pointer-events-auto flex h-[var(--dock-h)] w-full max-w-[420px] items-stretch rounded-[26px] p-1.5">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[10.5px] font-medium tracking-[0.01em] transition-colors",
                active ? "text-ink" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {active && (
                <motion.span
                  layoutId="dock-active"
                  transition={{ type: "spring", stiffness: 520, damping: 42 }}
                  className="absolute inset-0 -z-10 rounded-[20px] metal-card"
                />
              )}
              <Icon size={21} strokeWidth={active ? 2 : 1.7} className={active ? "text-steel" : undefined} />
              <span>{label}</span>
            </Link>
          );
        })}
      </GlassPanel>
    </div>
  );
}

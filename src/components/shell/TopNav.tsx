"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/primitives";
import { activityLabel, useCurrentBook } from "@/lib/library/current";

/**
 * Navigation as three big words at the top of the screen — «Слушаю · Книги · Магазин» — instead of a tab bar.
 * The first word follows what you are doing (Слушаю / Читаю) and leads to the home screen.
 */
export function TopNav({ className, toned }: { className?: string; toned?: boolean }) {
  const pathname = usePathname() ?? "/";
  const current = useCurrentBook();
  const items = [
    { href: "/", label: activityLabel(current), active: pathname === "/" },
    { href: "/library/", label: "Книги", active: pathname.startsWith("/library") },
    { href: "/store/", label: "Магазин", active: pathname.startsWith("/store") },
  ];
  return (
    <nav aria-label="Разделы" className={cn("no-scrollbar flex items-baseline gap-4 overflow-x-auto whitespace-nowrap px-5", className)}>
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          data-nav={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "display text-[27px] transition-opacity duration-200",
            toned ? "text-t-ink" : "text-ink",
            it.active ? "opacity-100" : "opacity-[0.36] hover:opacity-60",
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/profile/Avatar";
import { cn } from "@/components/ui/primitives";
import { useIdentity } from "@/lib/account/identity";
import { useActivityLabel } from "@/lib/library/current";

/**
 * Navigation as three big words at the top of the screen — «Слушаю · Книги · Магазин» — instead of a tab bar,
 * with the profile as an avatar at the end. The first word follows what you are doing (Слушаю / Читаю) and
 * leads to the home screen.
 */
export function TopNav({ className, toned }: { className?: string; toned?: boolean }) {
  const pathname = usePathname() ?? "/";
  const label = useActivityLabel();
  const user = useIdentity((s) => s.user);
  const items = [
    { href: "/", label, active: pathname === "/" },
    { href: "/library/", label: "Книги", active: pathname.startsWith("/library") },
    { href: "/store/", label: "Магазин", active: pathname.startsWith("/store") },
  ];
  return (
    // The same box on every page, so switching sections never moves the words.
    <div className={cn("mx-auto flex w-full max-w-[1280px] items-center gap-3 px-5 sm:px-8", className)}>
      <nav aria-label="Разделы" className="no-scrollbar flex min-w-0 flex-1 items-baseline gap-4 overflow-x-auto whitespace-nowrap sm:gap-6">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            data-nav={it.href}
            aria-current={it.active ? "page" : undefined}
            className={cn(
              "display text-[27px] transition-opacity duration-200 sm:text-[34px] md:text-[38px]",
              toned ? "text-t-ink" : "text-ink",
              it.active ? "opacity-100" : "opacity-[0.36] hover:opacity-60",
            )}
          >
            {it.label}
          </Link>
        ))}
      </nav>
      <Link href="/profile/" data-nav="/profile/" aria-label={user ? `Профиль: ${user.name}` : "Профиль"} className="shrink-0 rounded-full transition-transform active:scale-95">
        <Avatar user={user} size={36} toned={toned} />
      </Link>
    </div>
  );
}

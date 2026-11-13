"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar } from "@/components/profile/Avatar";
import { cn } from "@/components/ui/primitives";
import { useIdentity } from "@/lib/account/identity";
import { t } from "@/lib/i18n";
import { useActivity } from "@/lib/library/current";

/**
 * Navigation as three big words at the top of the screen — «Слушаю · Книги · Магазин» — instead of a tab bar,
 * with the profile as an avatar at the end. The first word follows what you are doing (Слушаю / Читаю) and
 * leads to the home screen.
 */
export function TopNav({ className, toned }: { className?: string; toned?: boolean }) {
  const pathname = usePathname() ?? "/";
  const activity = useActivity();
  const label = { home: t("Главная"), listening: t("Слушаю"), reading: t("Читаю") }[activity];
  const user = useIdentity((s) => s.user);
  const items = [
    { href: "/", label, active: pathname === "/" },
    { href: "/library/", label: t("Книги"), active: pathname.startsWith("/library") },
    { href: "/store/", label: t("Магазин"), active: pathname.startsWith("/store") },
  ];
  return (
    // The same box on every page, so switching sections never moves the words.
    <div className={cn("mx-auto flex w-full max-w-[1280px] items-center gap-3 px-5 sm:px-8", className)}>
      {/*
        No scroll box here: it cut off the words' descenders («g»). The words shrink to fit narrow phones instead (the
        longest row, «Главная Книги Магазин», fits a 320-pixel screen; clipped sideways only as a last resort), and
        the inactive ones are a paler colour rather than a transparent layer.
      */}
      <nav
        aria-label={t("Разделы")}
        className="flex min-w-0 flex-1 items-baseline gap-4 overflow-x-clip whitespace-nowrap sm:gap-6"
      >
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            data-nav={it.href}
            aria-current={it.active ? "page" : undefined}
            className={cn(
              "display text-[clamp(18px,calc(9vw_-_11px),27px)] transition-colors duration-200 sm:text-[34px] md:text-[38px]",
              toned
                ? it.active ? "text-t-ink" : "text-t-ink/36 hover:text-t-ink/60"
                : it.active ? "text-ink" : "text-ink/36 hover:text-ink/60",
            )}
          >
            {it.label}
          </Link>
        ))}
      </nav>
      <Link href="/profile/" data-nav="/profile/" aria-label={user ? t("Профиль: {name}", { name: user.name }) : t("Профиль")} className="shrink-0 rounded-full transition-transform active:scale-95">
        <Avatar user={user} size={36} toned={toned} />
      </Link>
    </div>
  );
}

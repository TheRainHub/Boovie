"use client";

import { usePathname } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { FullPlayer } from "@/components/player/FullPlayer";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { Toaster } from "@/components/ui/Toaster";
import { startAccount, syncSoon } from "@/lib/account/session";
import { persistNow, restoreLastSession, unlockAudio } from "@/lib/audio/player";
import { withBase } from "@/lib/basePath";
import { markHydrated, t, useLang } from "@/lib/i18n";
import { flushJournal } from "@/lib/library/repository";
import { backfillFinished, restoreStashedActivity, stashActivity } from "@/lib/stats/activity";
import { useTheme } from "@/lib/theme";
import { ImportTray } from "./ImportTray";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname?.startsWith("/book");
  // The page is mounted afresh in the chosen language (see lib/i18n): after hydration and on a switch in the settings.
  const lang = useLang();
  useEffect(() => markHydrated(), []);
  useEffect(() => {
    const section = [["/library", t("Книги")], ["/store", t("Магазин")], ["/profile", t("Профиль")], ["/settings", t("Настройки")], ["/book", t("Книга")]]
      .find(([p]) => pathname?.startsWith(p))?.[1];
    const want = section ? `${section} · Boowie` : t("Boowie — книги и аудиокниги");
    document.title = want;
    // Next.js writes the page's static (Russian) title back when it renders its metadata: keep this one.
    const observer = new MutationObserver(() => {
      if (document.title !== want) document.title = want;
    });
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, lang]);

  useEffect(() => {
    const theme = useTheme.getState();
    theme.sync();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => useTheme.getState().sync();
    mq.addEventListener("change", onScheme);

    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerup", unlock);
    window.addEventListener("keydown", unlock);

    const onHide = (e: Event) => {
      if (e.type === "visibilitychange" && document.visibilityState === "visible") {
        restoreStashedActivity();
        return;
      }
      if (e.type !== "pagehide" && document.visibilityState !== "hidden") return;
      void persistNow();
      stashActivity();
      syncSoon(0);
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    void restoreLastSession();
    void flushJournal().catch(() => undefined);
    restoreStashedActivity();
    void startAccount().then(() => backfillFinished()).catch(() => undefined);

    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/"), updateViaCache: "none" }).catch(() => undefined);
    }
    return () => {
      mq.removeEventListener("change", onScheme);
      window.removeEventListener("pointerup", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  return (
    <Fragment key={lang}>
      <div className={immersive ? "" : "pb-[calc(var(--mini-h)+var(--sab)+28px)]"}>{children}</div>
      {!immersive && <MiniPlayer />}
      <FullPlayer />
      <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+10px)] z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <ImportTray />
        <Toaster />
      </div>
    </Fragment>
  );
}

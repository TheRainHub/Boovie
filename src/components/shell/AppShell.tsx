"use client";

import { usePathname } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { FullPlayer } from "@/components/player/FullPlayer";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { toast, Toaster } from "@/components/ui/Toaster";
import { pullSoon, pushWhilePlaying, startAccount, syncSoon } from "@/lib/account/session";
import { persistNow, restoreLastSession, seek, unlockAudio, usePlayer } from "@/lib/audio/player";
import { formatClock } from "@/lib/format";
import { claimRemotePositions } from "@/lib/library/cloud";
import { withBase } from "@/lib/basePath";
import { markHydrated, t, useLang } from "@/lib/i18n";
import { isNative } from "@/lib/native";
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
        // Back on the screen: what did the other devices do meanwhile?
        pullSoon();
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

    // The apps carry their files with them: the offline cache is for the web version.
    if (!isNative() && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/"), updateViaCache: "none" }).catch(() => undefined);
    }
    const stopBackButton = isNative() ? listenBackButton() : undefined;

    // Pausing is a natural moment to hand the place to the account; a long uninterrupted listen does it now and then.
    const stopPlayerSync = usePlayer.subscribe((s, prev) => {
      if (prev.isPlaying && !s.isPlaying) syncSoon(0);
      else if (s.isPlaying) pushWhilePlaying();
    });
    // A newer place from another device for the book in the player: a paused player goes there, a playing one
    // keeps its own place (it is the one being listened to).
    const stopClaim = claimRemotePositions((bookId, p) => {
      const s = usePlayer.getState();
      if (s.bookId !== bookId) return false;
      if (s.isPlaying) return true;
      if (Math.abs(p.audioTimestamp - s.position) > 5) {
        setTimeout(() => {
          void seek(p.audioTimestamp, { autoplay: false });
          const ch = [...usePlayer.getState().chapters].reverse().find((c) => c.startTime <= p.audioTimestamp + 0.001);
          toast(t("Место с другого устройства: {where}", { where: ch ? `${ch.title} · ${formatClock(p.audioTimestamp - ch.startTime)}` : formatClock(p.audioTimestamp) }), "success");
        }, 0);
      }
      return false;
    });
    return () => {
      stopBackButton?.();
      stopPlayerSync();
      stopClaim();
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

/**
 * Android's back button: closes an open sheet (the player, a menu) first, then goes back a page; on the first page
 * the app goes to the background instead of closing, so a playing book goes on.
 */
function listenBackButton(): () => void {
  let stopped = false;
  let remove: (() => void) | undefined;
  void import("@capacitor/app").then(({ App }) =>
    App.addListener("backButton", ({ canGoBack }) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        // The sheets close on Escape.
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      } else if (canGoBack && window.history.length > 1) {
        window.history.back();
      } else {
        void App.minimizeApp();
      }
    }).then((handle) => {
      if (stopped) void handle.remove();
      else remove = () => void handle.remove();
    }),
  ).catch(() => undefined);
  return () => {
    stopped = true;
    remove?.();
  };
}

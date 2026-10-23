"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FullPlayer } from "@/components/player/FullPlayer";
import { MiniPlayer } from "@/components/player/MiniPlayer";
import { Toaster } from "@/components/ui/Toaster";
import { persistNow, restoreLastSession, unlockAudio } from "@/lib/audio/player";
import { withBase } from "@/lib/basePath";
import { useTheme } from "@/lib/theme";
import { BottomDock } from "./BottomDock";
import { ImportTray } from "./ImportTray";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const immersive = pathname?.startsWith("/book");

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

    const onHide = () => {
      if (document.visibilityState === "hidden") void persistNow();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    void restoreLastSession();

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
    <>
      <div className={immersive ? "" : "pb-[calc(var(--dock-h)+var(--sab)+88px)]"}>{children}</div>
      {!immersive && <MiniPlayer />}
      {!immersive && <BottomDock />}
      <FullPlayer />
      <div className="pointer-events-none fixed inset-x-0 top-[calc(var(--sat)+10px)] z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
        <ImportTray />
        <Toaster />
      </div>
    </>
  );
}

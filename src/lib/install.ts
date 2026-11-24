"use client";

/**
 * The site as an app on the phone: added to the home screen it opens full screen, from its own icon, and works
 * offline (the service worker keeps it). Android's Chrome can do it in one tap (`beforeinstallprompt`); iPhone and
 * iPad do it from the share menu, so there the app shows how.
 */
import { create } from "zustand";
import { isNative } from "./native";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  /** The browser's own install offer, kept for a tap on «Установить». */
  offer: InstallPromptEvent | null;
  /** Installed during this visit. */
  installed: boolean;
  /** The guide sheet is open. */
  open: boolean;
}

export const useInstall = create<InstallState>(() => ({ offer: null, installed: false, open: false }));

export type InstallPlatform = "ios" | "android" | "other";

export function installPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  // iPadOS presents itself as a Mac with a touch screen.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

/** Opened from the home screen (or in the apps): nothing to install. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (isNative()) return true;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || ["standalone", "fullscreen", "minimal-ui"].some((m) => window.matchMedia?.(`(display-mode: ${m})`).matches);
}

/** Catch the browser's install offer (it comes once, early) and the moment the app is installed. */
export function listenInstall(): () => void {
  const onOffer = (e: Event) => {
    // Our own card offers it instead of the browser's bar.
    e.preventDefault();
    useInstall.setState({ offer: e as InstallPromptEvent });
  };
  const onInstalled = () => useInstall.setState({ offer: null, installed: true, open: false });
  window.addEventListener("beforeinstallprompt", onOffer);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onOffer);
    window.removeEventListener("appinstalled", onInstalled);
  };
}

/** The browser's own install dialog; false when there is none (or it was turned down). */
export async function installNow(): Promise<boolean> {
  const offer = useInstall.getState().offer;
  if (!offer) return false;
  await offer.prompt();
  const { outcome } = await offer.userChoice;
  // The offer can be used once.
  useInstall.setState({ offer: null, installed: outcome === "accepted" });
  return outcome === "accepted";
}

const HIDE_KEY = "boowie-install-hidden";
const HIDE_DAYS = 30;

/** The home screen's card was closed: it comes back in a month. */
export function hideInstallCard(): void {
  try {
    localStorage.setItem(HIDE_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}

export function installCardHidden(): boolean {
  try {
    const at = Number(localStorage.getItem(HIDE_KEY) ?? 0);
    return Date.now() - at < HIDE_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

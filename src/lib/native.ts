/**
 * The app runs either as a web page (PWA) or inside the Capacitor shells for iOS and Android. In the shells the
 * audio is played by the native player (see audio/native.ts) and audio files live in the app's own files, where
 * that player can read them.
 */
import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function platform(): "ios" | "android" | "web" {
  try {
    const p = Capacitor.getPlatform();
    return p === "ios" || p === "android" ? p : "web";
  } catch {
    return "web";
  }
}

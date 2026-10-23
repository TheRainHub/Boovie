"use client";

import { create } from "zustand";
import { THEME_STORAGE_KEY } from "./themeKey";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  /** Re-read the system scheme (called from a matchMedia listener). */
  sync: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  preference: "system",
  resolved: "light",
  setPreference: (preference) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      /* private mode */
    }
    const resolved = resolve(preference);
    document.documentElement.setAttribute("data-theme", resolved);
    set({ preference, resolved });
  },
  sync: () => {
    const preference = readPreference();
    const resolved = resolve(preference);
    if (document.documentElement.getAttribute("data-theme") !== resolved) {
      document.documentElement.setAttribute("data-theme", resolved);
    }
    if (get().preference !== preference || get().resolved !== resolved) set({ preference, resolved });
  },
}));

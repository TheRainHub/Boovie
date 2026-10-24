"use client";

import { create } from "zustand";
import { THEME_STORAGE_KEY } from "./themeKey";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v as T) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref !== "system") return pref;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

interface ThemeState {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  /** Re-read the stored choice and the system scheme (called on start and from a matchMedia listener). */
  sync: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  preference: "system",
  resolved: "light",
  setPreference: (preference) => {
    write(THEME_STORAGE_KEY, preference);
    const resolved = resolve(preference);
    document.documentElement.setAttribute("data-theme", resolved);
    set({ preference, resolved });
  },
  sync: () => {
    const preference = read<ThemePreference>(THEME_STORAGE_KEY, ["system", "light", "dark"], "system");
    const resolved = resolve(preference);
    const root = document.documentElement;
    if (root.getAttribute("data-theme") !== resolved) root.setAttribute("data-theme", resolved);
    const s = get();
    if (s.preference !== preference || s.resolved !== resolved) set({ preference, resolved });
  },
}));

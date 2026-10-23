"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ReaderFont = "inter" | "georgia" | "mono";
export type Paper = "silver" | "sepia" | "carbon" | "oled";
export type ReaderMode = "paged" | "scroll";

export const FONT_STACKS: Record<ReaderFont, string> = {
  inter: "var(--font-inter), -apple-system, system-ui, sans-serif",
  georgia: "Georgia, var(--font-literata), 'Times New Roman', serif",
  mono: "var(--font-jetbrains), ui-monospace, monospace",
};

export const FONT_LABELS: Record<ReaderFont, string> = { inter: "Inter", georgia: "Georgia", mono: "JetBrains Mono" };

export interface PaperTint {
  label: string;
  bg: string;
  ink: string;
  heading: string;
  muted: string;
  accent: string;
  rule: string;
  dark: boolean;
}

export const PAPERS: Record<Paper, PaperTint> = {
  silver: { label: "Серебро", bg: "#ECEEF2", ink: "#1B1E24", heading: "#0F1115", muted: "#5E6673", accent: "#5A7184", rule: "rgba(15,17,21,0.12)", dark: false },
  sepia: { label: "Сепия", bg: "#F1E8D8", ink: "#3A2F24", heading: "#2A2119", muted: "#7A6A57", accent: "#8A6A48", rule: "rgba(58,47,36,0.16)", dark: false },
  carbon: { label: "Карбон", bg: "#15171B", ink: "#C9CED6", heading: "#ECEFF4", muted: "#848D9C", accent: "#7B93A8", rule: "rgba(255,255,255,0.1)", dark: true },
  oled: { label: "OLED", bg: "#000000", ink: "#B2B8C2", heading: "#DCE0E6", muted: "#6B7280", accent: "#7B93A8", rule: "rgba(255,255,255,0.08)", dark: true },
};

export interface ReaderPrefs {
  font: ReaderFont;
  fontSize: number;
  lineHeight: number;
  margin: number;
  paper: Paper;
  mode: ReaderMode;
  justify: boolean;
  pdfMode: ReaderMode;
  pdfInvert: boolean;
  set: (patch: Partial<Omit<ReaderPrefs, "set">>) => void;
}

export const useReaderPrefs = create<ReaderPrefs>()(
  persist(
    (set) => ({
      font: "georgia",
      fontSize: 19,
      lineHeight: 1.55,
      margin: 22,
      paper: "silver",
      mode: "paged",
      justify: true,
      pdfMode: "scroll",
      pdfInvert: false,
      set: (patch) => set(patch),
    }),
    { name: "titan-reader-prefs", version: 1 },
  ),
);

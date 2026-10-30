"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t } from "../i18n";

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
  silver: { get label() { return t("Бумага"); }, bg: "#F6F1E9", ink: "#2A231D", heading: "#1D1814", muted: "#7A6F64", accent: "#B4512C", rule: "rgba(29,24,20,0.12)", dark: false },
  sepia: { get label() { return t("Сепия"); }, bg: "#F1E6D2", ink: "#3A2F24", heading: "#2A2119", muted: "#7A6A57", accent: "#9A5A33", rule: "rgba(58,47,36,0.16)", dark: false },
  carbon: { get label() { return t("Ночь"); }, bg: "#15110E", ink: "#D6CDBF", heading: "#F3ECE1", muted: "#8F857A", accent: "#D98C68", rule: "rgba(255,255,255,0.1)", dark: true },
  oled: { get label() { return t("Чёрная"); }, bg: "#000000", ink: "#BDB4A8", heading: "#E8E0D4", muted: "#7A7065", accent: "#D98C68", rule: "rgba(255,255,255,0.08)", dark: true },
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

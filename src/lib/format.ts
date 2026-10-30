/** Formatting in the interface language (see lib/i18n). */
import { getLang, locale, t } from "./i18n";

/** 0:42 · 12:05 · 1:02:33 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** "2 ч 15 мин" · "48 мин" · "< 1 мин" (2 h 15 min) */
export function formatDuration(seconds: number): string {
  const total = Math.round((seconds || 0) / 60);
  const [hr, min] = getLang() === "en" ? ["h", "min"] : ["ч", "мин"]; // i18n-ignore
  if (total < 1) return `< 1 ${min}`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m} ${min}`;
  return m ? `${h} ${hr} ${m} ${min}` : `${h} ${hr}`;
}

export function formatBytes(bytes: number): string {
  const units = getLang() === "en" ? ["B", "KB", "MB", "GB"] : ["Б", "КБ", "МБ", "ГБ"]; // i18n-ignore
  if (!bytes) return `0 ${units[0]}`;
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${v.toLocaleString(locale(), { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(locale(), { day: "numeric", month: "long" });
}

export function formatLabel(format: string): string {
  return { epub: "EPUB", fb2: "FB2", pdf: "PDF", audio: t("Аудио") }[format] ?? format.toUpperCase();
}

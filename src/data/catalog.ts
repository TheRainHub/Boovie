import { withBase } from "@/lib/basePath";
import { getLang, t } from "@/lib/i18n";
import data from "./catalog.generated.json";

export type CategoryId = "classics" | "scifi" | "detective" | "adventure" | "science" | "design" | "psychology" | "tech" | "bio";

export interface StoreFile {
  url: string;
  name: string;
  size: number;
}

export interface StoreItem {
  id: string;
  kind: "ebook" | "audiobook";
  format: string;
  formatLabel: string;
  title: string;
  subtitle?: string;
  author: string;
  /** English books: the title and author as Russian readers know them (shown, and found by search). */
  titleRu?: string;
  authorRu?: string;
  /** Russian books: the title and author in English, for the English interface. */
  titleEn?: string;
  authorEn?: string;
  /** English text of the description, the narrator line and the cover credit. */
  synopsisEn?: string;
  narratorEn?: string;
  coverCreditEn?: string;
  translator?: string;
  narrator?: string;
  year: number;
  language: "ru" | "en";
  categories: CategoryId[];
  /** Editorial score (0–5) assigned by the catalog curators. */
  rating: number;
  /** Editorial ranking used by the «Топ чарты» shelf. */
  rank: number;
  addedAt: string;
  companion?: string;
  synopsis: string;
  coverUrl: string;
  /** Painting the cover is made from: «Painter, «Title», year». */
  coverCredit?: string;
  files: StoreFile[];
  fileSize: number;
  duration?: number;
  pages?: number;
  chapterCount?: number;
}

/** Category names in the interface language. */
export function categoryName(id: CategoryId): string {
  return {
    classics: t("Классика"), scifi: t("Фантастика"), detective: t("Детективы"), adventure: t("Приключения"), science: t("Наука"),
    design: t("Индустриальный дизайн"), psychology: t("Психология"), tech: t("Технологии"), bio: t("Биографии"),
  }[id];
}

export const STORE_ITEMS = (data.items as StoreItem[]).map((i) => ({
  ...i,
  coverUrl: withBase(i.coverUrl),
  files: i.files.map((f) => ({ ...f, url: withBase(f.url) })),
}));

const english = () => getLang() === "en";

/** The author as the interface reads it: «Лев Толстой» / «Leo Tolstoy». */
export function authorOf(item: StoreItem): string {
  return (english() && item.authorEn) || item.author;
}

/** The book's title in the other language, shown under the original: «Великий Гэтсби», «Anna Karenina». */
export function otherTitle(item: StoreItem): string | undefined {
  return english() ? item.titleEn : item.titleRu;
}

export function synopsisOf(item: StoreItem): string {
  return (english() && item.synopsisEn) || item.synopsis;
}

export function narratorOf(item: StoreItem): string | undefined {
  return (english() && item.narratorEn) || item.narrator;
}

export function creditOf(item: StoreItem): string | undefined {
  return (english() && item.coverCreditEn) || item.coverCredit;
}

/** Everything the store search looks in, in both languages. */
export function searchText(item: StoreItem): string {
  return [item.title, item.author, item.subtitle, item.titleRu, item.authorRu, item.titleEn, item.authorEn].filter(Boolean).join(" ");
}

export function storeItem(id: string | undefined): StoreItem | undefined {
  return id ? STORE_ITEMS.find((i) => i.id === id) : undefined;
}

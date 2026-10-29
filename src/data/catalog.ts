import { withBase } from "@/lib/basePath";
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

export const CATEGORIES = data.categories as Record<CategoryId, string>;
export const STORE_ITEMS = (data.items as StoreItem[]).map((i) => ({
  ...i,
  coverUrl: withBase(i.coverUrl),
  files: i.files.map((f) => ({ ...f, url: withBase(f.url) })),
}));

export function storeItem(id: string | undefined): StoreItem | undefined {
  return id ? STORE_ITEMS.find((i) => i.id === id) : undefined;
}

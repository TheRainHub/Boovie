import Dexie, { type EntityTable } from "dexie";
import type { BookRecord, ChapterRecord, FileRecord, ProgressRecord } from "./types";

export type TitanDB = Dexie & {
  books: EntityTable<BookRecord, "id">;
  chapters: EntityTable<ChapterRecord, "id">;
  progress: EntityTable<ProgressRecord, "bookId">;
  files: EntityTable<FileRecord, "id">;
};

let instance: TitanDB | null = null;

export function getDB(): TitanDB {
  if (instance) return instance;
  const db = new Dexie("titan-library") as TitanDB;
  db.version(1).stores({
    books: "id, addedAt, format, storeId, lastOpenedAt",
    chapters: "id, bookId, [bookId+index]",
    progress: "bookId, updatedAt",
    files: "id, bookId, role",
  });
  instance = db;
  return db;
}

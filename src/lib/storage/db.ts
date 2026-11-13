import Dexie, { type EntityTable } from "dexie";
import type { ActivityRecord, BookRecord, ChapterRecord, CloudRecord, FileRecord, ProgressRecord } from "./types";

export type TitanDB = Dexie & {
  books: EntityTable<BookRecord, "id">;
  chapters: EntityTable<ChapterRecord, "id">;
  progress: EntityTable<ProgressRecord, "bookId">;
  files: EntityTable<FileRecord, "id">;
  activity: EntityTable<ActivityRecord, "id">;
  cloud: EntityTable<CloudRecord, "id">;
  /** Dictionary data fetched so far (lib/dictionary): `${lang}:index` and `${lang}:${shard}`. */
  dict: EntityTable<{ id: string; data: unknown }, "id">;
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
  db.version(2).stores({
    activity: "id, owner, [owner+deviceId], [owner+bookKey]",
  });
  db.version(3).stores({
    books: "id, addedAt, format, storeId, lastOpenedAt, syncKey",
    cloud: "id, owner",
  });
  db.version(4).stores({
    dict: "id",
  });
  instance = db;
  return db;
}

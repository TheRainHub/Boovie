/**
 * Binary storage for books and audio tracks.
 *
 * Large files go to the Origin Private File System when the browser can write to it from the main thread
 * (FileSystemFileHandle.createWritable). Otherwise — e.g. older iOS Safari — the Blob is stored directly in
 * IndexedDB, which WebKit persists to disk without the 5 MB localStorage ceiling.
 */
import { getDB } from "./db";
import type { FileRecord } from "./types";

const OPFS_DIR = "titan-files";

type WritableHandle = FileSystemFileHandle & { createWritable?: () => Promise<FileSystemWritableFileStream> };

let opfsDir: Promise<FileSystemDirectoryHandle | null> | null = null;

function getOpfsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (opfsDir) return opfsDir;
  opfsDir = (async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.storage?.getDirectory) return null;
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle(OPFS_DIR, { create: true });
      // Probe that main-thread writes are supported.
      const probe = (await dir.getFileHandle(".probe", { create: true })) as WritableHandle;
      if (typeof probe.createWritable !== "function") return null;
      return dir;
    } catch {
      return null;
    }
  })();
  return opfsDir;
}

export function newId(prefix = ""): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${rnd}` : rnd;
}

export async function putFile(
  blob: Blob,
  meta: { bookId: string; name: string; role: FileRecord["role"]; mime?: string },
): Promise<FileRecord> {
  const id = newId("f");
  const mime = meta.mime || blob.type || "application/octet-stream";
  const base = { id, bookId: meta.bookId, name: meta.name, mime, size: blob.size, role: meta.role, createdAt: Date.now() };
  const dir = await getOpfsDir();
  if (dir && blob.size > 64 * 1024) {
    try {
      const handle = (await dir.getFileHandle(id, { create: true })) as WritableHandle;
      const writable = await handle.createWritable!();
      await writable.write(blob);
      await writable.close();
      const record: FileRecord = { ...base, storage: "opfs" };
      await getDB().files.put(record);
      return record;
    } catch {
      // Quota or platform error: fall back to IndexedDB below.
    }
  }
  const record: FileRecord = { ...base, storage: "idb", blob };
  await getDB().files.put(record);
  return record;
}

/** iOS reports .m4b/.m4a as audio/x-m4b / audio/x-m4a; blob: URLs play by their type, and Safari wants audio/mp4. */
const MIME_ALIASES: Record<string, string> = { "audio/x-m4b": "audio/mp4", "audio/x-m4a": "audio/mp4", "audio/m4a": "audio/mp4", "audio/m4b": "audio/mp4" };

function withType(blob: Blob, mime: string): Blob {
  const type = MIME_ALIASES[mime] ?? mime;
  return type && blob.type !== type ? new Blob([blob], { type }) : blob;
}

export async function getFileBlob(id: string): Promise<Blob | null> {
  const record = await getDB().files.get(id);
  if (!record) return null;
  if (record.storage === "idb") return record.blob ? withType(record.blob, record.mime) : null;
  const dir = await getOpfsDir();
  if (!dir) return null;
  try {
    const handle = await dir.getFileHandle(id);
    return withType(await handle.getFile(), record.mime);
  } catch {
    return null;
  }
}

export async function deleteFiles(ids: string[]): Promise<void> {
  const db = getDB();
  const records = await db.files.bulkGet(ids);
  const dir = await getOpfsDir();
  for (const r of records) {
    if (r?.storage === "opfs" && dir) {
      try {
        await dir.removeEntry(r.id);
      } catch {
        /* already gone */
      }
    }
  }
  await db.files.bulkDelete(ids);
}

/** Session cache of object URLs so the same blob isn't re-materialized for every render. */
const urlCache = new Map<string, Promise<string | null>>();

export function getFileUrl(id: string): Promise<string | null> {
  let url = urlCache.get(id);
  if (!url) {
    url = getFileBlob(id).then((b) => (b ? URL.createObjectURL(b) : null));
    urlCache.set(id, url);
  }
  return url;
}

export function revokeFileUrls(ids: string[]): void {
  for (const id of ids) {
    const p = urlCache.get(id);
    if (p) {
      void p.then((u) => u && URL.revokeObjectURL(u));
      urlCache.delete(id);
    }
  }
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number; persisted: boolean } | null> {
  try {
    const est = await navigator.storage.estimate();
    const persisted = (await navigator.storage.persisted?.()) ?? false;
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return null;
  }
}

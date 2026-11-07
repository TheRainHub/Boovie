/**
 * Binary storage for books and audio tracks.
 *
 * Large files go to the Origin Private File System when the browser can write to it from the main thread
 * (FileSystemFileHandle.createWritable). Otherwise — e.g. older iOS Safari — the Blob is stored directly in
 * IndexedDB, which WebKit persists to disk without the 5 MB localStorage ceiling. In the iOS/Android apps large
 * files and all audio go to the app's own files instead, where the native player can read them (nativeFiles.ts).
 */
import { isNative } from "../native";
import { getDB } from "./db";
import { deleteNativeFile, nativeFileSrc, nativeFileUri, readNativeFile, writeNativeFile } from "./nativeFiles";
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
  if (isNative() && (blob.size > 64 * 1024 || mime.startsWith("audio/"))) {
    try {
      const record: FileRecord = { ...base, storage: "native", path: await writeNativeFile(id, blob) };
      await getDB().files.put(record);
      return record;
    } catch {
      // Out of space or a platform error: IndexedDB below.
    }
  }
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
  if (record.storage === "native") {
    const blob = record.path ? await readNativeFile(record.path) : null;
    return blob ? withType(blob, record.mime) : null;
  }
  const dir = await getOpfsDir();
  if (!dir) return null;
  // One retry: a file that was just written can be briefly unreadable on WebKit.
  for (let i = 0; i < 2; i++) {
    try {
      const handle = await dir.getFileHandle(id);
      return withType(await handle.getFile(), record.mime);
    } catch {
      if (i === 0) await new Promise((r) => setTimeout(r, 300));
    }
  }
  return null;
}

export async function deleteFiles(ids: string[]): Promise<void> {
  const db = getDB();
  const records = await db.files.bulkGet(ids);
  const dir = await getOpfsDir();
  for (const r of records) {
    if (r?.storage === "native" && r.path) await deleteNativeFile(r.path);
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
    url = getDB().files.get(id).then((r) =>
      // An app file is loaded straight from the disk, without making a copy of it in memory.
      r?.storage === "native" && r.path ? nativeFileSrc(r.path) : getFileBlob(id).then((b) => b && URL.createObjectURL(b)),
    ).then((u) => {
      // Don't remember a miss: the next call looks again (the file may have just been written).
      if (!u) urlCache.delete(id);
      return u;
    }, () => {
      urlCache.delete(id);
      return null;
    });
    urlCache.set(id, url);
  }
  return url;
}

/**
 * file:// URI of a file for the native player. A file kept in the WebView's storage (put there before, or too small
 * to go to the app's files) is moved to the app's files first.
 */
export async function nativeFilePath(id: string): Promise<string | null> {
  const db = getDB();
  const record = await db.files.get(id);
  if (!record) return null;
  if (record.storage === "native" && record.path) return nativeFileUri(record.path);
  const blob = await getFileBlob(id);
  if (!blob) return null;
  const path = await writeNativeFile(id, blob);
  await db.files.put({ ...record, storage: "native", path, blob: undefined });
  if (record.storage === "opfs") {
    try {
      await (await getOpfsDir())?.removeEntry(id);
    } catch {
      /* already gone */
    }
  }
  return nativeFileUri(path);
}

export function revokeFileUrls(ids: string[]): void {
  for (const id of ids) {
    const p = urlCache.get(id);
    if (p) {
      void p.then((u) => u?.startsWith("blob:") && URL.revokeObjectURL(u));
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
    let usage = est.usage ?? 0;
    // In the apps most of the library is in the app's files, which the browser's estimate doesn't see.
    if (isNative()) await getDB().files.each((f) => void (f.storage === "native" && (usage += f.size)));
    return { usage, quota: est.quota ?? 0, persisted: isNative() || persisted };
  } catch {
    return null;
  }
}

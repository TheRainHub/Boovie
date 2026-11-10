"use client";

/**
 * The user's own files in the account's cloud (Cloudflare R2 behind workers/files), so another device can download
 * them. Store and Librarr books never go there: they are downloaded from where they came from.
 *
 * Uploading runs on its own, one book at a time, while the app is open and signed in: after the start, after a
 * book is added, and when the app comes back to the screen. Files over 50 MB go in 50 MB parts, and a part that
 * got through is not sent again after a restart. Before uploading, the cloud is asked whether it already has the
 * book (the same file uploaded from another device). Not over mobile data where the browser tells (Android).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t } from "../i18n";
import { probeDuration, useImports } from "../library/importer";
import { saveParsedBook } from "../library/repository";
import type { ParsedBook } from "../parsers/types";
import { fileRange } from "../storage/blobStore";
import { getDB } from "../storage/db";
import type { BookRecord, CloudEntry } from "../storage/types";
import { useIdentity } from "./identity";
import { accessToken, accountsEnabled, supabaseKey } from "./session";

const FILES_URL = (process.env.NEXT_PUBLIC_FILES_URL ?? "https://boowie-files.theraintv94.workers.dev").replace(/\/+$/, "");
/** Upload part size: R2 wants equal parts of at least 5 MB; a Worker takes up to 100 MB in one request. */
const PART = Math.max(5, Number(process.env.NEXT_PUBLIC_FILES_PART_MB) || 50) * 1024 * 1024;
const PARTS_KEY = "boowie-cloud-parts";
const FORGET_KEY = "boowie-cloud-forget";

export const filesEnabled = accountsEnabled && !!FILES_URL;

/** The user's choice (Settings), kept on the device. */
export const useCloudFiles = create<{ upload: boolean; set: (upload: boolean) => void }>()(
  persist((set) => ({ upload: true, set: (upload) => set({ upload }) }), { name: "boowie-cloud-files", version: 1 }),
);

/** What the uploader is doing, for the settings screen. */
export const useUploads = create<{ title?: string; done: number; total: number; waiting: number; error?: string }>(() => ({ done: 0, total: 0, waiting: 0 }));

class FilesError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Own files go to the cloud: the user's files and the voiced editions, not store or Librarr books. */
export function isOwnBook(book: Pick<BookRecord, "syncKey">): boolean {
  return !!book.syncKey && (book.syncKey.startsWith("file:") || book.syncKey.startsWith("voice:"));
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken();
  if (!token) throw new FilesError(401, t("Войдите в аккаунт"));
  let res: Response;
  try {
    res = await fetch(`${FILES_URL}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey, ...(init.headers ?? {}) } });
  } catch {
    throw new FilesError(0, t("Нет связи с облаком"));
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new FilesError(res.status, res.status === 413 ? t("Место в облаке закончилось") : body.error ?? `HTTP ${res.status}`);
  }
  return res;
}

const bookPath = (key: string) => `/v1/books/${encodeURIComponent(key)}`;

interface Manifest {
  format: string;
  files: { name: string; mime: string; size: number; role: "source" | "cover" }[];
  uploadedAt?: number;
}

async function manifestOf(key: string): Promise<Manifest | null> {
  try {
    return (await (await api(bookPath(key))).json()) as Manifest;
  } catch (e) {
    if (e instanceof FilesError && e.status === 404) return null;
    throw e;
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────────────────

type PartsState = Record<string, { uploadId: string; parts: { partNumber: number; etag: string }[] }>;

function readParts(): PartsState {
  try {
    return JSON.parse(localStorage.getItem(PARTS_KEY) ?? "{}") as PartsState;
  } catch {
    return {};
  }
}

function writeParts(id: string, value: PartsState[string] | null): void {
  try {
    const all = readParts();
    if (value) all[id] = value;
    else delete all[id];
    localStorage.setItem(PARTS_KEY, JSON.stringify(all));
  } catch {
    /* a restart sends the file again */
  }
}

async function uploadFile(key: string, index: number, fileId: string, size: number, mime: string, onBytes: (n: number) => void): Promise<void> {
  const path = `${bookPath(key)}/files/${index}`;
  if (size <= PART) {
    const blob = await fileRange(fileId, 0, size);
    if (!blob || blob.size !== size) throw new FilesError(0, t("Файл не найден на устройстве"));
    await api(path, { method: "PUT", body: blob, headers: { "Content-Type": mime || "application/octet-stream" } });
    onBytes(size);
    return;
  }
  const stateId = `${key}#${index}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let state = readParts()[stateId];
    if (!state) {
      const { uploadId } = (await (await api(`${path}/uploads`, { method: "POST", body: JSON.stringify({ size, type: mime }), headers: { "Content-Type": "application/json" } })).json()) as { uploadId: string };
      state = { uploadId, parts: [] };
      writeParts(stateId, state);
    }
    onBytes(Math.min(size, state.parts.length * PART));
    try {
      for (let n = state.parts.length + 1; (n - 1) * PART < size; n++) {
        const start = (n - 1) * PART;
        const blob = await fileRange(fileId, start, Math.min(size, start + PART));
        if (!blob) throw new FilesError(0, t("Файл не найден на устройстве"));
        const part = (await (await api(`${path}/uploads/${encodeURIComponent(state.uploadId)}/${n}`, { method: "PUT", body: blob })).json()) as { partNumber: number; etag: string };
        state.parts.push({ partNumber: part.partNumber, etag: part.etag });
        writeParts(stateId, state);
        onBytes(Math.min(size, n * PART));
      }
      await api(`${path}/uploads/${encodeURIComponent(state.uploadId)}/complete`, { method: "POST", body: JSON.stringify({ parts: state.parts }), headers: { "Content-Type": "application/json" } });
      writeParts(stateId, null);
      return;
    } catch (e) {
      // The upload is gone on the other side (finished elsewhere, or older than a week): start the file again once.
      if (e instanceof FilesError && (e.status === 404 || e.status === 409) && attempt === 0) {
        writeParts(stateId, null);
        continue;
      }
      throw e;
    }
  }
}

async function uploadBook(book: BookRecord): Promise<void> {
  const db = getDB();
  const key = book.syncKey!;
  if (!(await manifestOf(key))) {
    const files = [...book.sourceFileIds.map((id) => ({ id, role: "source" as const })), ...(book.coverFileId ? [{ id: book.coverFileId, role: "cover" as const }] : [])];
    const records = await db.files.bulkGet(files.map((f) => f.id));
    if (records.some((r) => !r)) throw new FilesError(0, t("Файл не найден на устройстве"));
    const total = records.reduce((s, r) => s + r!.size, 0);
    let before = 0;
    useUploads.setState({ title: book.title, done: 0, total });
    for (const [i, f] of files.entries()) {
      const r = records[i]!;
      await uploadFile(key, i, f.id, r.size, r.mime, (n) => useUploads.setState({ done: before + n }));
      before += r.size;
    }
    const manifest: Manifest = { format: book.format, files: files.map((f, i) => ({ name: records[i]!.name, mime: records[i]!.mime, size: records[i]!.size, role: f.role })) };
    await api(bookPath(key), { method: "PUT", body: JSON.stringify(manifest), headers: { "Content-Type": "application/json" } });
  }
  // The account learns with the next upload of the library that this book can be downloaded.
  await db.books.where("syncKey").equals(key).modify((b) => {
    b.cloudFilesAt = Date.now();
    b.syncedAt = undefined;
  });
}

function onCellular(): boolean {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  return c?.type === "cellular" || !!c?.saveData;
}

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Upload the own books that aren't in the cloud yet, soon (one at a time; quietly stops on any trouble). */
export function kickUploads(delay = 4000): void {
  if (!filesEnabled || timer || running) return;
  timer = setTimeout(() => {
    timer = null;
    void runUploads();
  }, delay);
}

async function runUploads(): Promise<void> {
  if (running) return;
  running = true;
  const db = getDB();
  const failed = new Set<string>();
  try {
    await sendForgets();
    for (;;) {
      if (useIdentity.getState().status !== "signedIn" || !useCloudFiles.getState().upload || onCellular()) break;
      const waiting = (await db.books.toArray()).filter((b) => isOwnBook(b) && !b.cloudFilesAt && !failed.has(b.syncKey!));
      useUploads.setState({ waiting: waiting.length });
      const next = waiting[0];
      if (!next) break;
      try {
        await uploadBook(next);
        useUploads.setState({ error: undefined });
      } catch (e) {
        const err = e instanceof FilesError ? e : new FilesError(0, String(e));
        useUploads.setState({ error: err.message });
        // No connection or no space: try again later. A book that can't be read is skipped this time.
        if (err.status === 0 && /связи|connection/i.test(err.message)) break;
        if ([401, 413].includes(err.status) || err.status >= 500) break;
        failed.add(next.syncKey!);
      }
    }
  } finally {
    useUploads.setState({ title: undefined, done: 0, total: 0 });
    running = false;
  }
}

// ── Deleting ───────────────────────────────────────────────────────────────────────────────

function readForgets(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FORGET_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** The files of books deleted everywhere: removed from the cloud now, or with the next upload run. */
export function forgetCloudFiles(keys: string[]): void {
  if (!filesEnabled || !keys.length) return;
  try {
    localStorage.setItem(FORGET_KEY, JSON.stringify([...new Set([...readForgets(), ...keys])]));
  } catch {
    /* stays in the cloud */
  }
  void sendForgets().catch(() => undefined);
}

async function sendForgets(): Promise<void> {
  for (const key of readForgets()) {
    await api(bookPath(key), { method: "DELETE" });
    try {
      localStorage.setItem(FORGET_KEY, JSON.stringify(readForgets().filter((k) => k !== key)));
    } catch {
      /* ignore */
    }
  }
}

/** How much of the account's cloud space is used. */
export async function cloudUsage(): Promise<{ bytes: number; quota: number } | null> {
  if (!filesEnabled) return null;
  try {
    return (await (await api("/v1/usage")).json()) as { bytes: number; quota: number };
  } catch {
    return null;
  }
}

// ── Download ───────────────────────────────────────────────────────────────────────────────

async function readWithProgress(res: Response, size: number, onBytes: (n: number) => void, type: string): Promise<Blob> {
  if (!res.body) return new Blob([await res.arrayBuffer()], { type });
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    loaded += value.byteLength;
    onBytes(Math.min(loaded, size));
  }
  return new Blob(chunks, { type });
}

/** Download an own book of the account from the cloud and put it into this device's library (its place comes too). */
export async function downloadFromCloud(entry: CloudEntry): Promise<string> {
  const { upsert } = useImports.getState();
  const id = `cloud-${entry.key}`;
  upsert({ id, label: entry.title, progress: 0, stage: t("Загрузка из облака"), status: "running" });
  try {
    const manifest = await manifestOf(entry.key);
    if (!manifest) throw new Error(t("Книги ещё нет в облаке"));
    const total = manifest.files.reduce((s, f) => s + f.size, 0) || 1;
    let before = 0;
    const blobs: Blob[] = [];
    for (const [i, f] of manifest.files.entries()) {
      const res = await api(`${bookPath(entry.key)}/files/${i}`);
      blobs.push(await readWithProgress(res, f.size, (n) => upsert({ id, progress: ((before + n) / total) * 0.7 }), f.mime));
      before += f.size;
    }
    const report = (p: number, stage?: string) => upsert({ id, progress: 0.7 + p * 0.25, ...(stage ? { stage } : {}) });
    const sources = manifest.files.flatMap((f, i) => (f.role === "source" ? [{ blob: blobs[i], name: f.name }] : []));
    const coverIndex = manifest.files.findIndex((f) => f.role === "cover");
    let parsed: ParsedBook;
    if (entry.format === "audio") {
      const { parseAudio } = await import("../parsers/audioParser");
      parsed = await parseAudio(sources, report, { probeDuration });
    } else {
      const { parseBookFile } = await import("../parsers");
      parsed = await parseBookFile(sources[0].blob, sources[0].name, report, { probeDuration });
    }
    if (coverIndex >= 0) parsed.cover = blobs[coverIndex];
    upsert({ id, progress: 0.96, stage: t("Сохранение") });
    const bookId = await saveParsedBook(parsed, { syncKey: entry.key, coverSource: coverIndex >= 0 ? "user" : undefined });
    await getDB().books.update(bookId, { cloudFilesAt: manifest.uploadedAt ?? Date.now() });
    upsert({ id, progress: 1, stage: t("В библиотеке"), status: "done", bookId });
    return bookId;
  } catch (e) {
    upsert({ id, status: "error", error: (e as Error).message || t("Не удалось загрузить") });
    throw e;
  }
}

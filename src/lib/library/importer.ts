"use client";

import { create } from "zustand";
import { ensureCover } from "../covers/auto";
import { parseAudio } from "../parsers/audioParser";
import { isAudioName, parseBookFile } from "../parsers";
import { mimeFromName, stripExtension } from "../parsers/text";
import { extractZipEntry, isZip, listZip } from "../parsers/zipStream";
import { getDB } from "../storage/db";
import { requestPersistentStorage } from "../storage/blobStore";
import { isImageName, planImport, type PickedFile } from "./grouping";
import { linkCompanions, saveParsedBook } from "./repository";
import { narratorOf, synopsisOf, type StoreItem } from "@/data/catalog";
import { pl, t } from "../i18n";

export interface ImportJob {
  id: string;
  label: string;
  progress: number; // 0..1
  stage: string;
  status: "running" | "done" | "error";
  error?: string;
  bookId?: string;
  storeId?: string;
  /** The job can be stopped from the tray (see `onCancel`). */
  cancellable?: boolean;
}

const cancels = new Map<string, () => void>();

/** Register what «Стоп» in the import tray does for a long-running job. */
export function onCancel(jobId: string, fn: () => void): () => void {
  cancels.set(jobId, fn);
  return () => cancels.delete(jobId);
}

export function cancelJob(jobId: string): void {
  cancels.get(jobId)?.();
}

interface ImportState {
  jobs: ImportJob[];
  upsert: (job: Partial<ImportJob> & { id: string }) => void;
  clearFinished: () => void;
}

export const useImports = create<ImportState>((set, get) => ({
  jobs: [],
  upsert: (job) => {
    const jobs = get().jobs;
    const i = jobs.findIndex((j) => j.id === job.id);
    if (i < 0) set({ jobs: [...jobs, { label: "", progress: 0, stage: "", status: "running", ...job }] });
    else set({ jobs: jobs.map((j, k) => (k === i ? { ...j, ...job } : j)) });
  },
  clearFinished: () => set({ jobs: get().jobs.filter((j) => j.status === "running") }),
}));

let jobSeq = 0;

/** Duration probe for containers our tag readers can't time (ogg/wav/flac/webm). */
export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (fn: () => void) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute("src");
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error("timeout"))), 15000);
    audio.onloadedmetadata = () => {
      if (isFinite(audio.duration)) {
        clearTimeout(timer);
        done(() => resolve(audio.duration));
      } else {
        // Some containers (webm) report Infinity until the end is probed.
        audio.currentTime = 1e9;
        audio.ontimeupdate = () => {
          clearTimeout(timer);
          audio.ontimeupdate = null;
          done(() => resolve(audio.duration));
        };
      }
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(() => reject(new Error("decode")));
    };
    audio.src = url;
  });
}

/** Expand ZIP archives that contain audio (an audiobook folder compressed in the iOS Files app). */
async function expandArchives(files: PickedFile[], report: (stage: string) => void): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  for (const f of files) {
    const zipLike = /\.zip$/i.test(f.name) && !/\.fb2\.zip$/i.test(f.name);
    if (!zipLike || !(await isZip(f.blob))) {
      out.push(f);
      continue;
    }
    const entries = await listZip(f.blob).catch(() => []);
    const media = entries.filter((e) => isAudioName(e.path) || isImageName(e.path));
    if (!media.some((e) => isAudioName(e.path))) {
      out.push(f); // e.g. a zipped FB2 — handled by the document parsers
      continue;
    }
    const base = f.path ? f.path.replace(/\.zip$/i, "") : stripExtension(f.name);
    for (let i = 0; i < media.length; i++) {
      const e = media[i];
      report(t("Распаковка {n} из {total}", { n: i + 1, total: media.length }));
      const name = e.path.split("/").pop()!;
      const blob = await extractZipEntry(f.blob, e, mimeFromName(name));
      out.push({ blob, name, path: `${base}/${e.path}` });
    }
  }
  return out;
}

/**
 * Import picked files or a whole folder. Every folder with audio becomes ONE audiobook (each file a chapter,
 * CD/Disc subfolders merged, cover.jpg/folder.jpg as the cover); loose audio files picked together form one
 * book too; every document becomes its own book. Covers are completed in the background (see ensureCover).
 */
export async function importLocalFiles(files: File[]): Promise<string[]> {
  void requestPersistentStorage();
  const ids: string[] = [];
  const { upsert } = useImports.getState();

  const run = async (label: string, work: (report: (p: number, stage?: string) => void) => Promise<string>) => {
    const id = `job-${++jobSeq}`;
    upsert({ id, label, progress: 0, stage: t("Подготовка"), status: "running" });
    try {
      const bookId = await work((p, stage) => upsert({ id, progress: p, ...(stage ? { stage } : {}) }));
      upsert({ id, progress: 1, stage: t("Готово"), status: "done", bookId });
      ids.push(bookId);
      void ensureCover(bookId).catch(() => undefined);
    } catch (e) {
      upsert({ id, status: "error", error: (e as Error).message || t("Ошибка импорта") });
    }
  };

  const picked: PickedFile[] = files.map((f) => ({
    blob: f,
    name: f.name,
    path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || "",
  }));
  const hasArchive = picked.some((f) => /\.zip$/i.test(f.name) && !/\.fb2\.zip$/i.test(f.name));
  const expanded = hasArchive
    ? await (async () => {
        const id = `job-${++jobSeq}`;
        upsert({ id, label: t("Архив"), progress: 0, stage: t("Чтение архива"), status: "running" });
        try {
          return await expandArchives(picked, (stage) => upsert({ id, stage }));
        } finally {
          useImports.setState({ jobs: useImports.getState().jobs.filter((j) => j.id !== id) });
        }
      })()
    : picked;

  const plan = planImport(expanded);
  if (!plan.audioGroups.length && !plan.documents.length) {
    upsert({ id: `job-${++jobSeq}`, label: files[0]?.name ?? t("Файлы"), status: "error", error: t("Нет поддерживаемых файлов: PDF, FB2, EPUB, MP3, M4B, M4A, ZIP") });
    return ids;
  }

  for (const g of plan.audioGroups) {
    const label = g.folderName ?? (g.audio.length === 1 ? g.audio[0].name : `${g.audio.length} ${pl(g.audio.length, "аудиофайл|аудиофайла|аудиофайлов")}`);
    await run(label, async (report) => {
      const parsed = await parseAudio(g.audio.map((f) => ({ blob: f.blob, name: f.name, path: f.path })), (p, s) => report(p * 0.8, s), { probeDuration, hint: g.hint });
      let coverSource: "embedded" | "folder" = "embedded";
      if (!parsed.cover && g.cover) {
        parsed.cover = g.cover.blob;
        coverSource = "folder";
      }
      report(0.85, t("Сохранение на устройство"));
      return saveParsedBook(parsed, { coverSource });
    });
  }
  for (const f of plan.documents) {
    await run(f.name, async (report) => {
      const parsed = await parseBookFile(f.blob, f.name, (p, s) => report(p * 0.85, s), { probeDuration });
      report(0.9, t("Сохранение на устройство"));
      return saveParsedBook(parsed);
    });
  }
  return ids;
}

async function fetchWithProgress(url: string, onBytes: (loaded: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(t("Сеть: {status}", { status: res.status }));
  const type = res.headers.get("content-type") ?? "";
  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array<ArrayBuffer>);
    loaded += value.byteLength;
    onBytes(loaded);
  }
  return new Blob(chunks, { type });
}

/** Download a catalog item into the library, parsing it with the same pipeline as local files. */
export async function downloadStoreItem(item: StoreItem): Promise<string> {
  void requestPersistentStorage();
  const db = getDB();
  const existing = await db.books.where("storeId").equals(item.id).first();
  if (existing) return existing.id;

  const { upsert } = useImports.getState();
  const id = `store-${item.id}`;
  upsert({ id, label: item.title, progress: 0, stage: t("Загрузка"), status: "running", storeId: item.id });
  try {
    const total = item.files.reduce((s, f) => s + f.size, 0);
    let done = 0;
    const blobs: { blob: Blob; name: string }[] = [];
    for (const f of item.files) {
      const blob = await fetchWithProgress(f.url, (loaded) => upsert({ id, progress: ((done + loaded) / total) * 0.7, stage: t("Загрузка") }));
      done += f.size;
      blobs.push({ blob, name: f.name });
    }
    const report = (p: number, stage?: string) => upsert({ id, progress: 0.7 + p * 0.25, ...(stage ? { stage } : {}) });
    const parsed = item.kind === "audiobook"
      ? await parseAudio(blobs, report, { probeDuration })
      : await parseBookFile(blobs[0].blob, blobs[0].name, report);
    // The catalog cover is canonical for store editions (PDF first pages are often plain title pages).
    const cover = await fetch(item.coverUrl).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    if (cover && cover.size > 0) parsed.cover = cover;
    upsert({ id, progress: 0.96, stage: t("Сохранение") });
    const bookId = await saveParsedBook(parsed, {
      isStoreBook: true,
      storeId: item.id,
      coverUrl: item.coverUrl,
      title: item.title,
      author: item.author,
      annotation: synopsisOf(item),
      narrator: narratorOf(item),
      language: item.language,
    });
    if (item.companion) {
      const companion = await db.books.where("storeId").equals(item.companion).first();
      if (companion) await linkCompanions(bookId, companion.id);
    }
    upsert({ id, progress: 1, stage: t("В библиотеке"), status: "done", bookId });
    return bookId;
  } catch (e) {
    upsert({ id, status: "error", error: (e as Error).message || t("Не удалось загрузить") });
    throw e;
  }
}

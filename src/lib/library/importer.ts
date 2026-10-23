"use client";

import { create } from "zustand";
import { parseAudio } from "../parsers/audioParser";
import { isAudioName, parseBookFile } from "../parsers";
import { getDB } from "../storage/db";
import { requestPersistentStorage } from "../storage/blobStore";
import { linkCompanions, saveParsedBook } from "./repository";
import type { StoreItem } from "@/data/catalog";

export interface ImportJob {
  id: string;
  label: string;
  progress: number; // 0..1
  stage: string;
  status: "running" | "done" | "error";
  error?: string;
  bookId?: string;
  storeId?: string;
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

/**
 * Import files picked by the user. Several audio files picked together form ONE audiobook
 * (each file a chapter); every document file becomes its own book.
 */
export async function importLocalFiles(files: File[]): Promise<string[]> {
  void requestPersistentStorage();
  const audio = files.filter((f) => isAudioName(f.name) || f.type.startsWith("audio/"));
  const docs = files.filter((f) => !audio.includes(f));
  const ids: string[] = [];
  const { upsert } = useImports.getState();

  const run = async (label: string, work: (report: (p: number, stage?: string) => void) => Promise<string>) => {
    const id = `job-${++jobSeq}`;
    upsert({ id, label, progress: 0, stage: "Подготовка", status: "running" });
    try {
      const bookId = await work((p, stage) => upsert({ id, progress: p, ...(stage ? { stage } : {}) }));
      upsert({ id, progress: 1, stage: "Готово", status: "done", bookId });
      ids.push(bookId);
    } catch (e) {
      upsert({ id, status: "error", error: (e as Error).message || "Ошибка импорта" });
    }
  };

  if (audio.length) {
    const label = audio.length === 1 ? audio[0].name : `${audio.length} аудиофайлов`;
    await run(label, async (report) => {
      const parsed = await parseAudio(audio.map((f) => ({ blob: f, name: f.name })), (p, s) => report(p * 0.8, s), { probeDuration });
      report(0.85, "Сохранение на устройство");
      return saveParsedBook(parsed);
    });
  }
  for (const f of docs) {
    await run(f.name, async (report) => {
      const parsed = await parseBookFile(f, f.name, (p, s) => report(p * 0.85, s), { probeDuration });
      report(0.9, "Сохранение на устройство");
      return saveParsedBook(parsed);
    });
  }
  return ids;
}

async function fetchWithProgress(url: string, onBytes: (loaded: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Сеть: ${res.status}`);
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
  upsert({ id, label: item.title, progress: 0, stage: "Загрузка", status: "running", storeId: item.id });
  try {
    const total = item.files.reduce((s, f) => s + f.size, 0);
    let done = 0;
    const blobs: { blob: Blob; name: string }[] = [];
    for (const f of item.files) {
      const blob = await fetchWithProgress(f.url, (loaded) => upsert({ id, progress: ((done + loaded) / total) * 0.7, stage: "Загрузка" }));
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
    upsert({ id, progress: 0.96, stage: "Сохранение" });
    const bookId = await saveParsedBook(parsed, {
      isStoreBook: true,
      storeId: item.id,
      coverUrl: item.coverUrl,
      title: item.title,
      author: item.author,
      annotation: item.synopsis,
      narrator: item.narrator,
      language: item.language,
    });
    if (item.companion) {
      const companion = await db.books.where("storeId").equals(item.companion).first();
      if (companion) await linkCompanions(bookId, companion.id);
    }
    upsert({ id, progress: 1, stage: "В библиотеке", status: "done", bookId });
    return bookId;
  } catch (e) {
    upsert({ id, status: "error", error: (e as Error).message || "Не удалось загрузить" });
    throw e;
  }
}

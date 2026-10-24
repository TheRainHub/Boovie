"use client";

/**
 * Voice a text book with ElevenLabs, chapter by chapter, into an audiobook companion.
 *
 * Every finished chapter is stored right away and remembered (per book, voice and model), so an interrupted run —
 * closed app, lost network, used-up quota — resumes without paying for the same chapters twice. At the end the
 * chapter files become one audiobook (one chapter per file, same titles as the text) linked to the text edition,
 * so «Читать / Слушать» switches between them at the same chapter.
 */
import { onCancel, probeDuration, useImports } from "../library/importer";
import { getChapter, getChapters, linkCompanions, saveParsedBook } from "../library/repository";
import { mp3Frames } from "../parsers/audioMetadata";
import { parseAudio } from "../parsers/audioParser";
import { deleteFiles, getFileBlob, putFile } from "../storage/blobStore";
import { getDB } from "../storage/db";
import { ELEVEN_MODELS, ElevenError, synthesize, useElevenPrefs, type ElevenModel } from "./elevenlabs";
import { chapterParagraphs, speechChunks } from "./speech";

const JOBS_KEY = "boowie-voiceover-jobs";

interface SavedJob {
  voiceId: string;
  model: ElevenModel;
  /** chapter index → stored MP3 file id */
  files: Record<number, string>;
}

function loadJobs(): Record<string, SavedJob> {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) ?? "{}") as Record<string, SavedJob>;
  } catch {
    return {};
  }
}

function saveJob(bookId: string, job: SavedJob | null) {
  const all = loadJobs();
  if (job) all[bookId] = job;
  else delete all[bookId];
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(all));
  } catch {
    /* private mode: no resume */
  }
}

export interface VoiceoverChapter {
  index: number;
  title: string;
  chunks: string[];
  chars: number;
  done: boolean;
}

export interface VoiceoverPlan {
  chapters: VoiceoverChapter[];
  totalChars: number;
  /** Characters still to synthesize (finished chapters from an earlier run excluded). */
  remainingChars: number;
  credits: number;
}

/** What voicing this book will take with the current voice and model. */
export async function planVoiceover(bookId: string): Promise<VoiceoverPlan> {
  const { voiceId, model } = useElevenPrefs.getState();
  const saved = loadJobs()[bookId];
  const resumable = saved && saved.voiceId === voiceId && saved.model === model ? saved : undefined;
  const parser = new DOMParser();
  const chapters: VoiceoverChapter[] = [];
  for (const meta of await getChapters(bookId)) {
    const ch = await getChapter(bookId, meta.index);
    const chunks = speechChunks(chapterParagraphs(ch?.contentOrBlobRef ?? "", parser));
    const chars = chunks.reduce((s, c) => s + c.length, 0);
    if (chars < 2) continue;
    chapters.push({ index: meta.index, title: meta.title, chunks, chars, done: !!resumable?.files[meta.index] });
  }
  const totalChars = chapters.reduce((s, c) => s + c.chars, 0);
  const remainingChars = chapters.reduce((s, c) => s + (c.done ? 0 : c.chars), 0);
  return { chapters, totalChars, remainingChars, credits: Math.ceil(remainingChars * ELEVEN_MODELS[model].creditsPerChar) };
}

const fileName = (n: number, title: string) => `${String(n + 1).padStart(3, "0")} ${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Глава"}.mp3`;

let running: string | null = null;

/** Run (or resume) the voiceover in the background; progress and errors show in the import tray. */
export async function runVoiceover(bookId: string): Promise<string | null> {
  if (running) throw new ElevenError("Уже идёт озвучка другой книги — дождитесь её или остановите.");
  const prefs = useElevenPrefs.getState();
  if (!prefs.apiKey || !prefs.voiceId) throw new ElevenError("Сначала добавьте ключ ElevenLabs и выберите голос в настройках.");
  const book = await getDB().books.get(bookId);
  if (!book || book.format === "audio") return null;

  const jobId = `voice-${bookId}`;
  const tray = useImports.getState();
  const controller = new AbortController();
  const stop = onCancel(jobId, () => controller.abort());
  running = bookId;
  tray.upsert({ id: jobId, label: `Озвучка: ${book.title}`, stage: "Подготовка текста", progress: 0, status: "running", cancellable: true });

  try {
    const plan = await planVoiceover(bookId);
    if (!plan.chapters.length) throw new ElevenError("В книге не нашлось текста для озвучки.");
    const saved = loadJobs()[bookId];
    const same = saved && saved.voiceId === prefs.voiceId && saved.model === prefs.model;
    // Chapters voiced earlier with another voice or model would not match: start over.
    if (saved && !same) await deleteFiles(Object.values(saved.files));
    const job: SavedJob = same ? saved : { voiceId: prefs.voiceId, model: prefs.model, files: {} };
    let doneChars = plan.totalChars - plan.remainingChars;

    for (const [n, ch] of plan.chapters.entries()) {
      if (job.files[ch.index] && (await getFileBlob(job.files[ch.index]))) continue;
      const parts: Uint8Array[] = [];
      for (const [k, text] of ch.chunks.entries()) {
        tray.upsert({ id: jobId, stage: `Глава ${n + 1} из ${plan.chapters.length}${ch.chunks.length > 1 ? ` · часть ${k + 1}/${ch.chunks.length}` : ""}`, progress: (doneChars / plan.totalChars) * 0.95 });
        const bytes = await synthesize(prefs.apiKey, prefs.voiceId, prefs.model, text, { previous: ch.chunks[k - 1]?.slice(-400), next: ch.chunks[k + 1]?.slice(0, 400) }, controller.signal);
        parts.push(mp3Frames(bytes));
        doneChars += text.length;
      }
      const blob = new Blob(parts as BlobPart[], { type: "audio/mpeg" });
      const rec = await putFile(blob, { bookId: jobId, name: fileName(n, ch.title), role: "source", mime: "audio/mpeg" });
      job.files[ch.index] = rec.id;
      saveJob(bookId, job);
    }

    tray.upsert({ id: jobId, stage: "Сборка аудиокниги", progress: 0.96 });
    const inputs = [];
    for (const [n, ch] of plan.chapters.entries()) {
      const blob = await getFileBlob(job.files[ch.index]);
      if (blob) inputs.push({ blob, name: fileName(n, ch.title) });
    }
    const parsed = await parseAudio(inputs, undefined, { probeDuration, hint: { title: book.title, author: book.author } });
    // One file per text chapter, in order: keep the text's titles and parts so Read ↔ Listen maps 1:1.
    const metas = await getChapters(bookId);
    parsed.chapters.forEach((c, i) => {
      const src = metas.find((m) => m.index === plan.chapters[i]?.index);
      if (src) Object.assign(c, { title: src.title, group: src.group });
    });
    if (book.coverFileId) parsed.cover = (await getFileBlob(book.coverFileId)) ?? undefined;
    const audioId = await saveParsedBook(parsed, {
      title: book.title,
      author: book.author,
      language: book.language,
      narrator: `ElevenLabs · ${prefs.voiceName ?? "голос"}`,
      coverUrl: book.coverFileId ? undefined : book.coverUrl,
      coverSource: book.coverSource,
    });
    await linkCompanions(bookId, audioId);
    await deleteFiles(Object.values(job.files));
    saveJob(bookId, null);
    tray.upsert({ id: jobId, stage: "Готово — аудиоверсия в ваших книгах", progress: 1, status: "done", bookId: audioId, cancellable: false });
    return audioId;
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    tray.upsert({
      id: jobId,
      status: "error",
      cancellable: false,
      error: aborted ? "Остановлено. Готовые главы сохранены — продолжите позже из меню книги." : `${(e as Error).message} Готовые главы сохранены.`,
    });
    return null;
  } finally {
    running = null;
    stop();
  }
}

/** Chapters already voiced for this book by an unfinished run (any voice/model). */
export function unfinishedVoiceover(bookId: string): number {
  return Object.keys(loadJobs()[bookId]?.files ?? {}).length;
}

/** Throw away an unfinished run (its stored chapters too). */
export async function discardVoiceover(bookId: string): Promise<void> {
  const job = loadJobs()[bookId];
  if (job) await deleteFiles(Object.values(job.files));
  saveJob(bookId, null);
}

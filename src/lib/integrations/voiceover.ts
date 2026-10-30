"use client";

/**
 * Voice a text book with ElevenLabs, chapter by chapter, into an audiobook companion.
 *
 * Every voiced piece is stored right away and remembered (per book, voice and model), so an interrupted run —
 * closed app, lost network, used-up quota — resumes without paying for the same text twice. At the end the
 * chapter files become one audiobook (one chapter per file, same titles as the text) linked to the text edition,
 * so «Читать / Слушать» switches between them at the same chapter. What is voiced so far can be put together
 * earlier to listen to (`listenToVoiceover`); the full audiobook later takes its place, at the same position.
 */
import { openAudioBook, unloadIfCurrent, usePlayer } from "../audio/player";
import { onCancel, probeDuration, useImports } from "../library/importer";
import { deleteBook, getChapter, getChapters, linkCompanions, saveParsedBook } from "../library/repository";
import { mp3Frames } from "../parsers/audioMetadata";
import { parseAudio } from "../parsers/audioParser";
import { deleteFiles, getFileBlob, putFile } from "../storage/blobStore";
import { getDB } from "../storage/db";
import { ELEVEN_MODELS, ElevenError, synthesize, useElevenPrefs, type ElevenModel } from "./elevenlabs";
import { chapterParagraphs, speechChunks } from "./speech";
import { t } from "../i18n";

const JOBS_KEY = "boowie-voiceover-jobs";

interface SavedJob {
  voiceId: string;
  voiceName?: string;
  model: ElevenModel;
  /** chapter index → stored MP3 file id */
  files: Record<number, string>;
  /** The chapter that was being voiced when the run stopped: its finished pieces (MP3 frames), in order. */
  partial?: { index: number; files: string[] };
  /** The audiobook put together from the part voiced so far; the next build replaces it. */
  audioId?: string;
}

/** Jobs of runs in progress: listening to the voiced part while the run goes on shares the same record. */
const live = new Map<string, SavedJob>();

function loadJobs(): Record<string, SavedJob> {
  try {
    return JSON.parse(localStorage.getItem(JOBS_KEY) ?? "{}") as Record<string, SavedJob>;
  } catch {
    return {};
  }
}

function jobOf(bookId: string): SavedJob | undefined {
  return live.get(bookId) ?? loadJobs()[bookId];
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
  /** Pieces of this chapter voiced by an interrupted run. */
  doneChunks: number;
}

export interface VoiceoverPlan {
  chapters: VoiceoverChapter[];
  totalChars: number;
  /** Characters still to synthesize (what an earlier run voiced excluded). */
  remainingChars: number;
  credits: number;
  /** Something is voiced already (with this voice and model): it can be listened to. */
  started: boolean;
}

/** Standard Ebooks front and back matter — licence and production notes, not the book — is not voiced. */
const NOT_THE_BOOK = /^(?:titlepage|title page|imprint|colophon|uncopyright|copyright)$/i;

/** What voicing this book will take with the current voice and model (or the given ones). */
export async function planVoiceover(bookId: string, use: { voiceId?: string; model: ElevenModel } = useElevenPrefs.getState()): Promise<VoiceoverPlan> {
  const { voiceId, model } = use;
  const saved = jobOf(bookId);
  const resumable = saved && saved.voiceId === voiceId && saved.model === model ? saved : undefined;
  const parser = new DOMParser();
  const chapters: VoiceoverChapter[] = [];
  for (const meta of await getChapters(bookId)) {
    if (NOT_THE_BOOK.test(meta.title.trim())) continue;
    const ch = await getChapter(bookId, meta.index);
    const chunks = speechChunks(chapterParagraphs(ch?.contentOrBlobRef ?? "", parser));
    const chars = chunks.reduce((s, c) => s + c.length, 0);
    if (chars < 2) continue;
    const done = !!resumable?.files[meta.index];
    const doneChunks = !done && resumable?.partial?.index === meta.index ? Math.min(resumable.partial.files.length, chunks.length) : 0;
    chapters.push({ index: meta.index, title: meta.title, chunks, chars, done, doneChunks });
  }
  const totalChars = chapters.reduce((s, c) => s + c.chars, 0);
  const left = (c: VoiceoverChapter) => (c.done ? 0 : c.chunks.slice(c.doneChunks).reduce((s, t) => s + t.length, 0));
  const remainingChars = chapters.reduce((s, c) => s + left(c), 0);
  return {
    chapters,
    totalChars,
    remainingChars,
    credits: Math.ceil(remainingChars * ELEVEN_MODELS[model].creditsPerChar),
    started: chapters.some((c) => c.done || c.doneChunks > 0),
  };
}

const fileName = (n: number, title: string) => `${String(n + 1).padStart(3, "0")} ${title.replace(/[\\/:*?"<>|]+/g, " ").trim() || t("Глава")}.mp3`;

let running: string | null = null;

/** Run (or resume) the voiceover in the background; progress and errors show in the import tray. */
export async function runVoiceover(bookId: string): Promise<string | null> {
  if (running) throw new ElevenError(t("Уже идёт озвучка другой книги — дождитесь её или остановите."));
  const prefs = useElevenPrefs.getState();
  if (!prefs.apiKey || !prefs.voiceId) throw new ElevenError(t("Сначала добавьте ключ ElevenLabs и выберите голос в настройках."));
  const book = await getDB().books.get(bookId);
  if (!book || book.format === "audio") return null;

  const jobId = `voice-${bookId}`;
  const tray = useImports.getState();
  const controller = new AbortController();
  const stop = onCancel(jobId, () => controller.abort());
  running = bookId;
  tray.upsert({ id: jobId, label: t("Озвучка: {title}", { title: book.title }), stage: t("Подготовка текста"), progress: 0, status: "running", cancellable: true });

  try {
    const plan = await planVoiceover(bookId);
    if (!plan.chapters.length) throw new ElevenError(t("В книге не нашлось текста для озвучки."));
    const saved = jobOf(bookId);
    const same = saved && saved.voiceId === prefs.voiceId && saved.model === prefs.model;
    // What was voiced earlier with another voice or model would not match: start over (the listening copy goes too).
    if (saved && !same) await dropJob(bookId, saved);
    const job: SavedJob = same ? saved : { voiceId: prefs.voiceId, voiceName: prefs.voiceName, model: prefs.model, files: {} };
    live.set(bookId, job);
    let doneChars = plan.totalChars - plan.remainingChars;

    for (const [n, ch] of plan.chapters.entries()) {
      if (job.files[ch.index] && (await getFileBlob(job.files[ch.index]))) continue;
      // Pieces of this chapter voiced before an interruption are not paid for again.
      if (job.partial && job.partial.index !== ch.index) {
        await deleteFiles(job.partial.files);
        job.partial = undefined;
      }
      const pieces = job.partial?.files ?? [];
      const parts: Uint8Array[] = [];
      for (const id of pieces) {
        const blob = await getFileBlob(id);
        if (!blob) break;
        parts.push(new Uint8Array(await blob.arrayBuffer()));
      }
      job.partial = { index: ch.index, files: pieces.slice(0, parts.length) };
      for (let k = parts.length; k < ch.chunks.length; k++) {
        const text = ch.chunks[k];
        tray.upsert({ id: jobId, stage: `${t("Глава {n} из {total}", { n: n + 1, total: plan.chapters.length })}${ch.chunks.length > 1 ? ` · ${t("часть {n}", { n: `${k + 1}/${ch.chunks.length}` })}` : ""}`, progress: (doneChars / plan.totalChars) * 0.95 });
        const bytes = await synthesize(prefs.apiKey, prefs.voiceId, prefs.model, text, { previous: ch.chunks[k - 1]?.slice(-400), next: ch.chunks[k + 1]?.slice(0, 400) }, controller.signal);
        const frames = mp3Frames(bytes);
        const piece = await putFile(new Blob([frames as BlobPart], { type: "audio/mpeg" }), { bookId: jobId, name: `${fileName(n, ch.title)}.${k}`, role: "source", mime: "audio/mpeg" });
        parts.push(frames);
        job.partial.files.push(piece.id);
        saveJob(bookId, job);
        doneChars += text.length;
      }
      const blob = new Blob(parts as BlobPart[], { type: "audio/mpeg" });
      const rec = await putFile(blob, { bookId: jobId, name: fileName(n, ch.title), role: "source", mime: "audio/mpeg" });
      job.files[ch.index] = rec.id;
      const done = job.partial.files;
      job.partial = undefined;
      saveJob(bookId, job);
      await deleteFiles(done);
    }

    tray.upsert({ id: jobId, stage: t("Сборка аудиокниги"), progress: 0.96 });
    const audioId = await assemble(bookId, plan, job, true);
    live.delete(bookId);
    await deleteFiles(Object.values(job.files));
    saveJob(bookId, null);
    tray.upsert({ id: jobId, stage: t("Готово — аудиоверсия в ваших книгах"), progress: 1, status: "done", bookId: audioId, cancellable: false });
    return audioId;
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    const kept = t("Озвученное сохранено: его можно послушать или продолжить из меню книги.");
    tray.upsert({ id: jobId, status: "error", cancellable: false, error: aborted ? `${t("Остановлено.")} ${kept}` : `${(e as Error).message} ${kept}` });
    return null;
  } finally {
    live.delete(bookId);
    running = null;
    stop();
  }
}

/**
 * Put the voiced chapters (and the voiced start of the chapter in progress) together as the text's audio edition.
 * An audiobook built earlier from less is replaced, keeping the listening position.
 */
async function assemble(bookId: string, plan: VoiceoverPlan, job: SavedJob, final: boolean): Promise<string> {
  const db = getDB();
  const book = await db.books.get(bookId);
  if (!book) throw new ElevenError(t("Книга не найдена на устройстве."));
  const inputs: { blob: Blob; name: string }[] = [];
  const used: VoiceoverChapter[] = [];
  for (const [n, ch] of plan.chapters.entries()) {
    let blob = job.files[ch.index] ? await getFileBlob(job.files[ch.index]) : null;
    if (!blob && !final && job.partial?.index === ch.index && job.partial.files.length) {
      const pieces = await Promise.all(job.partial.files.map((id) => getFileBlob(id)));
      if (pieces.every(Boolean)) blob = new Blob(pieces as Blob[], { type: "audio/mpeg" });
    }
    if (!blob) continue;
    inputs.push({ blob, name: fileName(n, ch.title) });
    used.push(ch);
  }
  if (!inputs.length) throw new ElevenError(t("Пока не озвучено ни одной части."));
  const parsed = await parseAudio(inputs, undefined, { probeDuration, hint: { title: book.title, author: book.author } });
  // One file per text chapter, in order: keep the text's titles and parts so Read ↔ Listen maps 1:1.
  const metas = await getChapters(bookId);
  parsed.chapters.forEach((c, i) => {
    const src = metas.find((m) => m.index === used[i]?.index);
    if (src) Object.assign(c, { title: src.title, group: src.group });
  });
  if (book.coverFileId) parsed.cover = (await getFileBlob(book.coverFileId)) ?? undefined;
  const voice = `ElevenLabs · ${job.voiceName ?? useElevenPrefs.getState().voiceName ?? t("голос")}`;
  const whole = used.filter((c) => job.files[c.index]).length;
  const audioId = await saveParsedBook(parsed, {
    title: book.title,
    author: book.author,
    language: book.language,
    narrator: final ? voice : `${voice} · ${t("озвучено {n} из {total} глав", { n: whole, total: plan.chapters.length })}`,
    coverUrl: book.coverFileId ? undefined : book.coverUrl,
    coverSource: book.coverSource,
  });
  const previous = job.audioId ? await db.books.get(job.audioId) : undefined;
  if (previous) {
    // Same chapters, same files at the start: the place in the earlier build is the place in this one.
    const progress = await db.progress.get(previous.id);
    if (progress) await db.progress.put({ ...progress, bookId: audioId });
    if (previous.lastOpenedAt) await db.books.update(audioId, { lastOpenedAt: previous.lastOpenedAt });
    const playing = usePlayer.getState().bookId === previous.id;
    unloadIfCurrent(previous.id);
    await deleteBook(previous.id);
    if (playing) void openAudioBook(audioId);
  }
  await linkCompanions(bookId, audioId);
  job.audioId = final ? undefined : audioId;
  if (!final) saveJob(bookId, job);
  return audioId;
}

/** Put together what is voiced so far (also while the run goes on) and return the audiobook to open. */
export async function listenToVoiceover(bookId: string): Promise<string> {
  const job = jobOf(bookId);
  if (!job) throw new ElevenError(t("Пока не озвучено ни одной части."));
  // Planned for the voice the job used, so its finished parts are the ones counted.
  return assemble(bookId, await planVoiceover(bookId, job), job, false);
}

/** Throw away a run's stored voice and the listening copy built from it. */
async function dropJob(bookId: string, job: SavedJob): Promise<void> {
  await deleteFiles([...Object.values(job.files), ...(job.partial?.files ?? [])]);
  if (job.audioId) {
    unloadIfCurrent(job.audioId);
    await deleteBook(job.audioId);
  }
  live.delete(bookId);
  saveJob(bookId, null);
}

/** Chapters (or a chapter's start) already voiced for this book by an unfinished run (any voice/model). */
export function unfinishedVoiceover(bookId: string): number {
  const job = jobOf(bookId);
  return Object.keys(job?.files ?? {}).length + (job?.partial?.files.length ? 1 : 0);
}

/** The audiobook was put together from an unfinished voiceover of this text: the voiceover can go on. */
export function isPartialVoiceover(textId: string, audioId: string | undefined): boolean {
  return !!audioId && jobOf(textId)?.audioId === audioId;
}

/** Throw away an unfinished run (its stored chapters and the listening copy too). */
export async function discardVoiceover(bookId: string): Promise<void> {
  const job = jobOf(bookId);
  if (job) await dropJob(bookId, job);
}

"use client";

import { AudioLines, BookOpen, ChevronLeft, Download, Headphones } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { VoiceoverSheet } from "@/components/integrations/VoiceoverSheet";
import { PlayerPanel } from "@/components/player/PlayerPanel";
import { PdfReader } from "@/components/reader/PdfReader";
import { TextReader } from "@/components/reader/TextReader";
import { BookCover } from "@/components/ui/BookCover";
import { CoverBackdrop } from "@/components/ui/CoverBackdrop";
import { Button, IconButton, ProgressBar, Segmented, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { storeItem } from "@/data/catalog";
import { openAudioBook, usePlayer } from "@/lib/audio/player";
import { useToned } from "@/lib/covers/tone";
import { formatClock } from "@/lib/format";
import { useBook, useChapterList, useProgress, type ChapterMeta } from "@/lib/library/hooks";
import { downloadStoreItem, useImports } from "@/lib/library/importer";
import { getProgress, journaledPosition, updateProgress } from "@/lib/library/repository";
import { PAPERS, useReaderPrefs } from "@/lib/reader/prefs";
import { mapChapterIndex } from "@/lib/reader/sync";
import type { BookRecord } from "@/lib/storage/types";
import { useTheme } from "@/lib/theme";
import { t } from "@/lib/i18n";

type Mode = "read" | "listen";
const LOOKUPS = 4;

export function BookScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  // A miss right after the book was added is looked up again a few times before «not found».
  const [attempt, setAttempt] = useState(0);
  const book = useBook(id, attempt);
  const companion = useBook(book?.companionId);
  const retrying = book === null && attempt % LOOKUPS !== LOOKUPS - 1;
  useEffect(() => {
    if (!retrying) return;
    const t = setTimeout(() => setAttempt((a) => a + 1), 400);
    return () => clearTimeout(t);
  }, [retrying, attempt]);

  const textBook = book ? (book.format === "audio" ? companion : book) : undefined;
  const audioBook = book ? (book.format === "audio" ? book : companion) : undefined;
  const requested = params.get("mode");
  const mode: Mode = requested === "listen" || requested === "read" ? requested : book?.format === "audio" ? "listen" : "read";

  const textChapters = useChapterList(textBook?.id);
  const audioChapters = useChapterList(audioBook?.id);
  const textProgress = useProgress(textBook?.id);
  const [readerKey, setReaderKey] = useState(0);

  // Reader chrome follows the paper tint (dark paper → dark chrome); restore the app theme on exit.
  const paperDark = PAPERS[useReaderPrefs((s) => s.paper)].dark;
  useEffect(() => {
    if (mode !== "read") return;
    document.documentElement.setAttribute("data-theme", paperDark ? "dark" : "light");
    return () => useTheme.getState().sync();
  }, [mode, paperDark]);

  const setMode = useCallback(
    async (next: Mode) => {
      if (next === mode || !book) return;
      // WhisperSync-style hand-off: whichever edition was used last wins; position maps by chapter + fraction.
      if (textBook && audioBook && textChapters && audioChapters) {
        const [tp, ap] = await Promise.all([getProgress(textBook.id), getProgress(audioBook.id)]);
        if (next === "listen" && tp.updatedAt >= ap.updatedAt && tp.updatedAt > 0) {
          const ai = mapChapterIndex(textChapters, audioChapters, tp.currentChapterIndex);
          const ch = audioChapters[ai];
          const frac = textBook.format === "pdf" ? 0 : tp.scrollOffsetOrPage;
          const time = (ch?.startTime ?? 0) + frac * (ch?.duration ?? 0);
          await openAudioBook(audioBook.id, { time, autoplay: false });
          toast(t("Синхронизировано: {where}", { where: `${ch?.title ?? ""} · ${formatClock(time - (ch?.startTime ?? 0))}` }), "success");
        } else if (next === "listen") {
          await openAudioBook(audioBook.id, { autoplay: false });
        } else if (next === "read" && ap.updatedAt > tp.updatedAt) {
          const ti = mapChapterIndex(audioChapters, textChapters, ap.currentChapterIndex);
          const ach = audioChapters[ap.currentChapterIndex];
          const frac = ach?.duration ? Math.max(0, Math.min(1, (ap.audioTimestamp - (ach.startTime ?? 0)) / ach.duration)) : 0;
          if (textBook.format === "pdf") {
            const tch = textChapters[ti];
            await updateProgress(textBook.id, { currentChapterIndex: ti, scrollOffsetOrPage: tch?.startPage ?? 1 });
          } else {
            await updateProgress(textBook.id, { currentChapterIndex: ti, scrollOffsetOrPage: frac });
          }
          setReaderKey((k) => k + 1);
          toast(t("Синхронизировано: {where}", { where: textChapters[ti]?.title ?? "" }), "success");
        }
      } else if (next === "listen" && audioBook) {
        await openAudioBook(audioBook.id, { autoplay: false });
      }
      router.replace(`/book/?id=${book.id}&mode=${next}`, { scroll: false });
    },
    [audioBook, audioChapters, book, mode, router, textBook, textChapters],
  );

  // Make sure the player holds this audiobook when landing directly in listen mode.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (mode === "listen" && audioBook && loadedFor.current !== audioBook.id && usePlayer.getState().bookId !== audioBook.id) {
      loadedFor.current = audioBook.id;
      void openAudioBook(audioBook.id, { autoplay: false });
    }
  }, [audioBook, mode]);

  if (book === undefined || retrying) return <Center><Spinner className="text-ink-2" /></Center>;
  if (book === null) {
    return (
      <Center>
        <p className="text-[16px] text-ink-2">{t("Книга не найдена на устройстве.")}</p>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => setAttempt((a) => a + 1)}>{t("Попробовать ещё раз")}</Button>
          <Button variant="secondary" onClick={() => router.push("/library/")}>{t("К книгам")}</Button>
        </div>
      </Center>
    );
  }
  // The other edition is still loading: don't flash «no audio/text edition» meanwhile.
  if (book.companionId && companion === undefined) return <Center><Spinner className="text-ink-2" /></Center>;

  const makeToggle = (toned: boolean) => (
    <Segmented
      layoutKey={toned ? "read-listen-toned" : "read-listen"}
      toned={toned}
      size="sm"
      value={mode}
      onChange={(m) => void setMode(m)}
      options={[
        { value: "read", label: t("Читать"), icon: <BookOpen size={15} strokeWidth={2.1} /> },
        { value: "listen", label: t("Слушать"), icon: <Headphones size={15} strokeWidth={2.1} /> },
      ]}
    />
  );
  const toggle = makeToggle(false);

  if (mode === "read") {
    if (!textBook) return <MissingEdition book={book} want="text" toggle={toggle} />;
    if (!textChapters || textProgress === undefined) return <Center><Spinner /></Center>;
    // A spot saved while the app was being hidden may not have reached the database.
    const journal = journaledPosition(textBook.id, textProgress);
    const at = journal ?? textProgress;
    if (textBook.format === "pdf") {
      return <PdfReader key={`${textBook.id}-${readerKey}`} book={textBook} chapters={textChapters} initialPage={Math.round(at?.scrollOffsetOrPage ?? 1) || 1} toggle={toggle} />;
    }
    return (
      <TextReader
        key={`${textBook.id}-${readerKey}`}
        book={textBook}
        chapters={textChapters}
        initialChapter={at?.currentChapterIndex ?? 0}
        initialFraction={at?.scrollOffsetOrPage ?? 0}
        toggle={toggle}
      />
    );
  }

  if (!audioBook) return <MissingEdition book={book} want="audio" toggle={toggle} />;
  return <ListenScreen audioBook={audioBook} toggle={makeToggle(true)} />;
}

/** «Слушать»: the whole screen in the colour of the audiobook's cover (with the cover blurred behind), and the player. */
function ListenScreen({ audioBook, toggle }: { audioBook: BookRecord; toggle: React.ReactNode }) {
  const loaded = usePlayer((s) => s.bookId === audioBook.id && s.chapters.length > 0);
  const { style } = useToned(audioBook.coverFileId, audioBook.coverUrl);
  return (
    <div className="relative isolate min-h-dvh text-t-ink" style={style}>
      <CoverBackdrop fileId={audioBook.coverFileId} url={audioBook.coverUrl} fixed />
      <TopBar toggle={toggle} toned />
      <div className="pt-[calc(var(--sat)+60px)] pb-[calc(var(--sab)+12px)]">
        {loaded ? <PlayerPanel variant="inline" /> : <div className="flex justify-center pt-40"><Spinner size={26} /></div>}
      </div>
    </div>
  );
}

function TopBar({ toggle, toned }: { toggle: React.ReactNode; toned?: boolean }) {
  const router = useRouter();
  return (
    <header className="fixed inset-x-0 top-0 z-30 pt-[var(--sat)]">
      <div className="mx-auto flex h-[56px] max-w-[760px] items-center gap-1 px-2">
        <IconButton label={t("Назад")} variant={toned ? "tonedGhost" : "ghost"} onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
          <ChevronLeft size={26} strokeWidth={2} />
        </IconButton>
        <div className="flex flex-1 justify-center">{toggle}</div>
        <div className="w-10" />
      </div>
    </header>
  );
}

/** Shown when the requested medium isn't in the library: offer the store companion if there is one. */
function MissingEdition({ book, want, toggle }: { book: BookRecord; want: "text" | "audio"; toggle?: React.ReactNode }) {
  const source = storeItem(book.storeId);
  const companion = storeItem(source?.companion);
  const job = useImports((s) => s.jobs.find((j) => j.storeId === companion?.id && j.status === "running"));
  const voicing = useImports((s) => s.jobs.find((j) => j.id === `voice-${book.id}` && j.status === "running"));
  const [voiceSheet, setVoiceSheet] = useState(false);
  const canVoice = want === "audio" && !companion && book.format !== "audio" && book.format !== "pdf";
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-bg">
      {toggle && <TopBar toggle={toggle} />}
      <div className="mx-auto flex max-w-[420px] flex-col items-center px-6 pt-[calc(var(--sat)+110px)] text-center">
        <div className="w-40">
          <BookCover fileId={book.coverFileId} url={companion?.coverUrl ?? book.coverUrl} title={book.title} author={book.author} square={want === "audio"} />
        </div>
        <h2 className="display mt-8 text-[26px]">
          {want === "audio" ? (companion ? t("Аудиоверсия есть в магазине") : t("Аудиоверсия недоступна")) : companion ? t("Электронная версия есть в магазине") : t("Электронная версия недоступна")}
        </h2>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-2">
          {companion
            ? t("Скачайте её — и переключайтесь между чтением и прослушиванием с синхронизацией по главам.")
            : canVoice
              ? t("Её можно сделать: ElevenLabs озвучит книгу глава за главой, и чтение с прослушиванием будут переключаться с той же главы.")
              : want === "audio"
                ? t("Для этой книги нет связанной аудиокниги. Загрузите MP3/M4B на полку, чтобы слушать.")
                : t("Для этой аудиокниги нет связанного текста.")}
        </p>
        {canVoice && (voicing ? (
          <div className="mt-6 w-full">
            <ProgressBar value={voicing.progress} />
            <div className="mt-2 text-[14px] text-ink-2 tabular">{voicing.stage} · {Math.round(voicing.progress * 100)}%</div>
          </div>
        ) : (
          <Button size="lg" className="mt-6" icon={<AudioLines size={18} strokeWidth={2} />} onClick={() => setVoiceSheet(true)}>
            {t("Озвучить через ElevenLabs")}
          </Button>
        ))}
        <VoiceoverSheet book={voiceSheet ? book : null} onClose={() => setVoiceSheet(false)} />
        {companion && (
          job ? (
            <div className="mt-6 w-full">
              <ProgressBar value={job.progress} />
              <div className="mt-2 text-[14px] text-ink-2 tabular">{job.stage} · {Math.round(job.progress * 100)}%</div>
            </div>
          ) : (
            <Button
              size="lg"
              className="mt-6"
              icon={<Download size={18} strokeWidth={2} />}
              onClick={async () => {
                try {
                  await downloadStoreItem(companion);
                  toast(t("Готово — можно переключаться"), "success");
                } catch {
                  toast(t("Не удалось скачать"), "error");
                }
              }}
            >
              {want === "audio" ? t("Скачать аудиоверсию") : t("Скачать текст")}
            </Button>
          )
        )}
        {!toggle && !companion && (
          <Button variant="secondary" className="mt-6" onClick={() => router.push("/library/")}>{t("К книгам")}</Button>
        )}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">{children}</div>;
}

export type { ChapterMeta };

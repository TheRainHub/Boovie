"use client";

import { BookOpen, ChevronLeft, Download, Headphones } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PlayerPanel } from "@/components/player/PlayerPanel";
import { PdfReader } from "@/components/reader/PdfReader";
import { TextReader } from "@/components/reader/TextReader";
import { BookCover } from "@/components/ui/BookCover";
import { GlassPanel, IconButton, MetallicButton, ProgressBar, Segmented, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { storeItem } from "@/data/catalog";
import { openAudioBook, usePlayer } from "@/lib/audio/player";
import { formatClock } from "@/lib/format";
import { useBook, useChapterList, useProgress, type ChapterMeta } from "@/lib/library/hooks";
import { downloadStoreItem, useImports } from "@/lib/library/importer";
import { getProgress, updateProgress } from "@/lib/library/repository";
import { PAPERS, useReaderPrefs } from "@/lib/reader/prefs";
import { mapChapterIndex } from "@/lib/reader/sync";
import type { BookRecord } from "@/lib/storage/types";
import { useTheme } from "@/lib/theme";

type Mode = "read" | "listen";

export function BookScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const book = useBook(id);
  const companion = useBook(book?.companionId);

  const textBook = book ? (book.format === "audio" ? companion : book) : undefined;
  const audioBook = book ? (book.format === "audio" ? book : companion) : undefined;
  const requested = params.get("mode");
  const mode: Mode = requested === "listen" || requested === "read" ? requested : book?.format === "audio" ? "listen" : "read";

  const textChapters = useChapterList(textBook?.id);
  const audioChapters = useChapterList(audioBook?.id);
  const textProgress = useProgress(textBook?.id);
  const [readerKey, setReaderKey] = useState(0);

  // Reader chrome follows the paper tint (dark paper → graphite chrome); restore the app theme on exit.
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
          toast(`Синхронизировано: ${ch?.title ?? ""} · ${formatClock(time - (ch?.startTime ?? 0))}`, "success");
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
          toast(`Синхронизировано: ${textChapters[ti]?.title ?? ""}`, "success");
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

  if (book === undefined) return <Center><Spinner /></Center>;
  if (book === null) {
    return (
      <Center>
        <p className="text-[15px] text-ink-2">Книга не найдена на устройстве.</p>
        <MetallicButton className="mt-4" onClick={() => router.push("/")}>На полку</MetallicButton>
      </Center>
    );
  }

  const toggle = (
    <Segmented
      layoutKey="read-listen"
      value={mode}
      onChange={(m) => void setMode(m)}
      options={[
        { value: "read", label: "Читать", icon: <BookOpen size={14} /> },
        { value: "listen", label: "Слушать", icon: <Headphones size={14} /> },
      ]}
    />
  );

  if (mode === "read") {
    if (!textBook) return <MissingEdition book={book} want="text" toggle={toggle} />;
    if (!textChapters || textProgress === undefined) return <Center><Spinner /></Center>;
    if (textBook.format === "pdf") {
      return <PdfReader key={`${textBook.id}-${readerKey}`} book={textBook} chapters={textChapters} initialPage={Math.round(textProgress?.scrollOffsetOrPage ?? 1) || 1} toggle={toggle} />;
    }
    return (
      <TextReader
        key={`${textBook.id}-${readerKey}`}
        book={textBook}
        chapters={textChapters}
        initialChapter={textProgress?.currentChapterIndex ?? 0}
        initialFraction={textProgress?.scrollOffsetOrPage ?? 0}
        toggle={toggle}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-bg">
      <TopBar toggle={toggle} />
      {audioBook ? (
        <div className="pt-[calc(var(--sat)+72px)] pb-[calc(var(--sab)+12px)]">
          <ListenPanel audioBook={audioBook} />
        </div>
      ) : (
        <MissingEdition book={book} want="audio" />
      )}
    </div>
  );
}

function ListenPanel({ audioBook }: { audioBook: BookRecord }) {
  const loaded = usePlayer((s) => s.bookId === audioBook.id && s.chapters.length > 0);
  if (!loaded) return <Center><Spinner /></Center>;
  return <PlayerPanel variant="inline" />;
}

function TopBar({ toggle }: { toggle: React.ReactNode }) {
  const router = useRouter();
  return (
    <GlassPanel as="header" className="fixed inset-x-0 top-0 z-30 rounded-none border-x-0 border-t-0 pt-[var(--sat)]">
      <div className="mx-auto flex h-[52px] max-w-[760px] items-center gap-1 px-1.5">
        <IconButton label="Назад" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
          <ChevronLeft size={22} strokeWidth={1.5} />
        </IconButton>
        <div className="flex flex-1 justify-center">{toggle}</div>
        <div className="w-10" />
      </div>
    </GlassPanel>
  );
}

/** Shown when the requested medium isn't in the library: offer the store companion if there is one. */
function MissingEdition({ book, want, toggle }: { book: BookRecord; want: "text" | "audio"; toggle?: React.ReactNode }) {
  const source = storeItem(book.storeId);
  const companion = storeItem(source?.companion);
  const job = useImports((s) => s.jobs.find((j) => j.storeId === companion?.id && j.status === "running"));
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-bg">
      {toggle && <TopBar toggle={toggle} />}
      <div className="mx-auto flex max-w-[420px] flex-col items-center px-6 pt-[calc(var(--sat)+120px)] text-center">
        <div className="w-36">
          <BookCover fileId={book.coverFileId} url={companion?.coverUrl ?? book.coverUrl} title={book.title} author={book.author} square={want === "audio"} />
        </div>
        <h2 className="mt-9 font-display text-[26px] leading-tight">
          {want === "audio" ? "Аудиоверсия" : "Электронная версия"} {companion ? "есть в магазине" : "недоступна"}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          {companion
            ? "Скачайте её — и переключайтесь между чтением и прослушиванием с синхронизацией по главам."
            : want === "audio"
              ? "Для этой книги нет связанной аудиокниги. Загрузите MP3/M4B на полку, чтобы слушать."
              : "Для этой аудиокниги нет связанного текста."}
        </p>
        {companion && (
          job ? (
            <div className="mt-6 w-full">
              <ProgressBar value={job.progress} />
              <div className="mt-2 text-[12px] text-ink-2 tabular">{job.stage} · {Math.round(job.progress * 100)}%</div>
            </div>
          ) : (
            <MetallicButton
              className="mt-6"
              icon={<Download size={16} />}
              onClick={async () => {
                try {
                  await downloadStoreItem(companion);
                  toast("Готово — можно переключаться", "success");
                } catch {
                  toast("Не удалось скачать", "error");
                }
              }}
            >
              Скачать {want === "audio" ? "аудиоверсию" : "текст"}
            </MetallicButton>
          )
        )}
        {!toggle && !companion && (
          <MetallicButton variant="secondary" className="mt-6" onClick={() => router.push("/")}>На полку</MetallicButton>
        )}
      </div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-center">{children}</div>;
}

export type { ChapterMeta };

"use client";

import { BookOpen, FilePlus2, FolderPlus, Headphones } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { DropTarget, useImportPicker } from "@/components/library/ImportPicker";
import { PauseGlyph, PlayGlyph } from "@/components/player/icons";
import { TopNav } from "@/components/shell/TopNav";
import { BookCover } from "@/components/ui/BookCover";
import { Button, cn, ProgressBar, Spinner } from "@/components/ui/primitives";
import { STORE_ITEMS } from "@/data/catalog";
import { openAudioBook, toggle, usePlayer } from "@/lib/audio/player";
import { toneVars, useToned } from "@/lib/covers/tone";
import { formatDuration } from "@/lib/format";
import { useCurrentBook, type CurrentBook } from "@/lib/library/current";
import { useAllProgress, useBooks, useChapterList } from "@/lib/library/hooks";
import type { BookRecord, ProgressRecord } from "@/lib/storage/types";

/** «Александр Пушкин» → «Пушкин»: the subtitle line has room for one name next to the chapter and time. */
function shortAuthor(author: string): string {
  if (/неизвестн/i.test(author)) return "";
  const first = author.split(/[,;&]/)[0].trim();
  const words = first.split(/\s+/);
  return words.length > 1 && /^[A-ZА-ЯЁ]/u.test(words[words.length - 1]) ? words[words.length - 1] : first;
}

/** Home: the book you are on, in its own colour, and the others you have started. */
export function HomeView() {
  const current = useCurrentBook();
  if (current === undefined) return <div className="min-h-dvh" />;
  if (current === null) return <Welcome />;
  return <NowScreen current={current} />;
}

function NowScreen({ current }: { current: CurrentBook }) {
  const { book, progress } = current;
  const router = useRouter();
  const { style } = useToned(book.coverFileId, book.coverUrl);
  const chapters = useChapterList(book.id);
  const player = usePlayer(useShallow((s) => ({ bookId: s.bookId, isPlaying: s.isPlaying, isLoading: s.isLoading, position: s.position, chapterIndex: s.chapterIndex })));
  const audio = book.format === "audio";
  const loaded = audio && player.bookId === book.id;

  const pct = loaded && book.duration ? player.position / book.duration : (progress?.percentage ?? 0) / 100;
  const chapterIndex = loaded ? player.chapterIndex : progress?.currentChapterIndex ?? 0;
  const chapter = chapters?.[chapterIndex];
  const started = pct > 0.001;
  const detail = audio
    ? [chapter?.title, book.duration ? (started ? `осталось ${formatDuration(book.duration * (1 - pct))}` : formatDuration(book.duration)) : null]
    : [book.totalChapters > 1 ? `Глава ${chapterIndex + 1} из ${book.totalChapters}` : null, started ? `${Math.round(pct * 100)}%` : "не начата"];

  const openPlayer = async () => {
    if (!loaded) await openAudioBook(book.id, { autoplay: false });
    usePlayer.getState().setExpanded(true);
  };
  const primary = () => {
    if (!audio) return router.push(`/book/?id=${book.id}`);
    if (loaded) toggle();
    else void openAudioBook(book.id, { autoplay: true });
  };

  return (
    <DropTarget>
      <main className="min-h-dvh pb-10 text-t-ink" style={{ ...style, background: "var(--t-bg)" }}>
        <TopNav toned className="pt-[calc(var(--sat)+14px)]" />

        <div className="mx-auto max-w-[560px] px-6">
          <button
            type="button"
            onClick={() => (audio ? void openPlayer() : router.push(`/book/?id=${book.id}`))}
            aria-label={audio ? `Открыть плеер: ${book.title}` : `Читать: ${book.title}`}
            className={cn("mx-auto mt-7 block transition-transform active:scale-[0.985]", audio ? "w-[min(70vw,300px)]" : "w-[min(52vw,214px)]")}
          >
            <BookCover
              fileId={book.coverFileId}
              url={book.coverUrl}
              title={book.title}
              author={book.author}
              square={audio}
              sizes="lg"
              className="shadow-[0_26px_50px_-18px_var(--t-shadow)]"
              shadow={false}
            />
          </button>

          <div className="mt-7 flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="display line-clamp-2 text-[27px]">{book.title}</h1>
              <p className="mt-1 truncate text-[15px] font-medium text-t-ink-2">{[shortAuthor(book.author), ...detail].filter(Boolean).join(" · ")}</p>
            </div>
            {audio ? (
              <button
                type="button"
                onClick={primary}
                aria-label={loaded && player.isPlaying ? "Пауза" : "Слушать"}
                className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full bg-t-btn text-t-btn-ink shadow-[0_10px_24px_-10px_var(--t-shadow)] transition-transform active:scale-95"
              >
                {loaded && player.isLoading ? <Spinner size={24} /> : loaded && player.isPlaying ? <PauseGlyph size={28} /> : <PlayGlyph size={28} />}
              </button>
            ) : (
              <Button variant="toned" size="lg" onClick={primary} icon={<BookOpen size={18} strokeWidth={2} />}>
                {started ? "Читать" : "Начать"}
              </Button>
            )}
          </div>
          <ProgressBar toned value={pct} className="mt-5 h-[3px]" />
          {book.companionId && <CompanionLink book={book} audio={audio} />}
        </div>

        <ContinueRow exclude={book.id} />
      </main>
    </DropTarget>
  );
}

function CompanionLink({ book, audio }: { book: BookRecord; audio: boolean }) {
  return (
    <Link prefetch={false} href={`/book/?id=${book.id}&mode=${audio ? "read" : "listen"}`}
      className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-t-chip px-4 text-[14px] font-semibold"
    >
      {audio ? <BookOpen size={16} strokeWidth={2} /> : <Headphones size={16} strokeWidth={2} />}
      {audio ? "Читать текстом" : "Слушать аудиокнигу"}
    </Link>
  );
}

/** Other started books (most recent first), or the newest ones when nothing else is in progress. */
function ContinueRow({ exclude }: { exclude: string }) {
  const books = useBooks();
  const progress = useAllProgress();
  const { started, rest } = useMemo(() => {
    const list = (books ?? []).filter((b) => b.id !== exclude);
    const pct = (b: BookRecord) => progress?.get(b.id)?.percentage ?? 0;
    const s = list.filter((b) => b.lastOpenedAt && pct(b) > 0 && pct(b) < 99.5).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    return { started: s, rest: list.filter((b) => !s.includes(b)) };
  }, [books, progress, exclude]);
  const row = started.length ? started : rest;
  if (!row.length) return null;
  return (
    <section className="mx-auto mt-10 max-w-[560px]">
      <h2 className="px-6 text-[18px] font-bold">{started.length ? "Продолжить" : "Ещё на полке"}</h2>
      <div className="no-scrollbar mt-3 flex items-end gap-3.5 overflow-x-auto px-6 pb-2">
        {row.slice(0, 12).map((b, i) => (
          <ContinueItem key={b.id} book={b} progress={progress?.get(b.id)} index={i} />
        ))}
      </div>
    </section>
  );
}

function ContinueItem({ book, progress, index }: { book: BookRecord; progress?: ProgressRecord; index: number }) {
  const audio = book.format === "audio";
  return (
    <Link prefetch={false} href={`/book/?id=${book.id}`} aria-label={book.title} data-format={book.format} className="rise block shrink-0" style={{ "--i": index, width: audio ? 112 : 92 } as CSSProperties}>
      <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square={audio} sizes="sm" />
      <ProgressBar toned value={(progress?.percentage ?? 0) / 100} className="mt-2 h-[3px]" />
    </Link>
  );
}

/** Empty library: what the app does, how to add books, and a peek into the store. */
function Welcome() {
  const { inputs, openFiles, openFolder } = useImportPicker();
  const style = toneVars(null);
  const picks = ["vystrel-audio", "anna-karenina", "pikovaya-dama", "viy-audio", "time-machine", "otcy-i-deti"]
    .map((id) => STORE_ITEMS.find((i) => i.id === id)!)
    .filter(Boolean);
  return (
    <DropTarget>
      <main className="min-h-dvh pb-10 text-t-ink" style={{ ...style, background: "var(--t-bg)" }}>
        <TopNav toned className="pt-[calc(var(--sat)+14px)]" />
        <div className="mx-auto max-w-[560px] px-6 pt-12">
          <h1 className="display text-[38px] leading-[1.02]">Здесь будет ваша книга</h1>
          <p className="mt-4 text-[17px] leading-[1.5] text-t-ink-2">
            Добавьте PDF, FB2, EPUB или аудиокнигу — файлом, папкой или архивом. Всё хранится на телефоне и работает без интернета.
          </p>
          <div className="mt-8 grid gap-2.5">
            <Button variant="toned" size="lg" icon={<FilePlus2 size={19} strokeWidth={2} />} onClick={openFiles}>
              Добавить файлы
            </Button>
            <Button variant="tonedSoft" size="lg" icon={<FolderPlus size={19} strokeWidth={2} />} onClick={openFolder}>
              Папку с аудиокнигой
            </Button>
          </div>
        </div>
        <section className="mx-auto mt-12 max-w-[560px]">
          <div className="flex items-baseline justify-between px-6">
            <h2 className="text-[18px] font-bold">Или возьмите в магазине</h2>
            <Link href="/store/" className="text-[14px] font-semibold text-t-ink-2">Все {STORE_ITEMS.length}</Link>
          </div>
          <div className="no-scrollbar mt-3 flex items-end gap-3.5 overflow-x-auto px-6 pb-2">
            {picks.map((i) => (
              <Link key={i.id} href={`/store/?item=${i.id}`} aria-label={i.title} className="block shrink-0" style={{ width: i.kind === "audiobook" ? 112 : 92 }}>
                <BookCover url={i.coverUrl} title={i.title} author={i.author} square={i.kind === "audiobook"} sizes="sm" />
              </Link>
            ))}
          </div>
        </section>
        {inputs}
      </main>
    </DropTarget>
  );
}

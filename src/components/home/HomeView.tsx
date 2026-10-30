"use client";

import { BookOpen, FilePlus2, FolderPlus, Headphones } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { DropTarget, useImportPicker } from "@/components/library/ImportPicker";
import { PlayGlyph } from "@/components/player/icons";
import { PlayerPanel } from "@/components/player/PlayerPanel";
import { TopNav } from "@/components/shell/TopNav";
import { BookCover } from "@/components/ui/BookCover";
import { CoverBackdrop } from "@/components/ui/CoverBackdrop";
import { Button, cn, ProgressBar } from "@/components/ui/primitives";
import { STORE_ITEMS } from "@/data/catalog";
import { openAudioBook, usePlayer } from "@/lib/audio/player";
import { toneVars, useToned } from "@/lib/covers/tone";
import { formatDuration, formatLabel } from "@/lib/format";
import { t } from "@/lib/i18n";
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
  const { book } = current;
  const { style } = useToned(book.coverFileId, book.coverUrl);
  const audio = book.format === "audio";
  return (
    <DropTarget>
      <main className="relative isolate min-h-dvh pb-10 text-t-ink" style={style}>
        <CoverBackdrop fileId={book.coverFileId} url={book.coverUrl} fixed />
        <TopNav toned className="pt-[calc(var(--sat)+14px)]" />
        {audio ? <ListeningNow current={current} /> : <ReadingNow current={current} />}
        <ContinueRow exclude={[book.id, book.companionId]} />
      </main>
    </DropTarget>
  );
}

/** «Слушаю»: the full player right on the home screen (the book is loaded into the engine, paused). */
function ListeningNow({ current }: { current: CurrentBook }) {
  const { book } = current;
  const loaded = usePlayer((s) => s.bookId === book.id && s.chapters.length > 0);
  const requested = useRef<string | null>(null);
  useEffect(() => {
    if (usePlayer.getState().bookId === book.id || requested.current === book.id) return;
    requested.current = book.id;
    void openAudioBook(book.id, { autoplay: false, touch: false });
  }, [book.id]);
  if (!loaded) return <NowHero current={current} />;
  return (
    <>
      <PlayerPanel variant="home" />
      {book.companionId && <div className="flex justify-center"><CompanionLink book={book} audio /></div>}
    </>
  );
}

/** «Читаю»: the cover, where you stopped, how far you are, and one button back into the text. */
function ReadingNow({ current }: { current: CurrentBook }) {
  const { book, progress } = current;
  const router = useRouter();
  const pct = (progress?.percentage ?? 0) / 100;
  const ci = progress?.currentChapterIndex ?? 0;
  const chapters = useChapterList(book.id);
  const started = pct > 0.001;
  return (
    <div className="mx-auto max-w-[600px] px-5 wide:grid wide:max-w-[1100px] wide:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)] wide:items-center wide:gap-14 wide:px-10">
      <button
        type="button"
        onClick={() => router.push(`/book/?id=${book.id}`)}
        aria-label={t("Читать: {title}", { title: book.title })}
        className="mx-auto mt-7 block w-[min(56vw,250px)] transition-transform active:scale-[0.985] sm:w-[min(46vw,320px)] wide:mt-6 wide:w-[min(100%,calc((100dvh-200px)*0.667))]"
      >
        <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} sizes="lg" shadow={false} className="shadow-[0_26px_50px_-18px_var(--t-shadow)]" />
      </button>
      <div className="mt-8 wide:mt-0">
        <h1 className="display line-clamp-3 text-[28px] sm:text-[36px]">{book.title}</h1>
        <p className="mt-1 text-[16px] font-medium text-t-ink-2 sm:text-[18px]">{book.author}</p>
        <div className="mt-6 rounded-[20px] bg-t-chip p-4">
          <div className="flex items-baseline justify-between gap-3 text-[14px] font-semibold">
            <span className="truncate">{started ? chapters?.[ci]?.title ?? t("Глава {n}", { n: ci + 1 }) : t("Ещё не начата")}</span>
            <span className="tabular shrink-0 text-t-ink-2">{Math.round(pct * 100)}%</span>
          </div>
          <ProgressBar toned value={pct} className="mt-2.5" />
          <div className="tabular mt-2 text-[13px] text-t-ink-2">
            {book.totalChapters > 1 ? t("Раздел {n} / {total}", { n: ci + 1, total: book.totalChapters }) : formatLabel(book.format)}
            {book.pageCount ? ` · ${t("{n} стр.", { n: book.pageCount })}` : ""}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Button variant="toned" size="lg" onClick={() => router.push(`/book/?id=${book.id}`)} icon={<BookOpen size={19} strokeWidth={2} />}>
            {started ? t("Продолжить чтение") : t("Начать читать")}
          </Button>
          {book.companionId && <CompanionLink book={book} audio={false} />}
        </div>
      </div>
    </div>
  );
}

/** Before the audiobook is loaded: the same composition without live controls. */
function NowHero({ current }: { current: CurrentBook }) {
  const { book, progress } = current;
  const pct = (progress?.percentage ?? 0) / 100;
  return (
    <div className="mx-auto max-w-[600px] px-5">
      <div className="mx-auto mt-6 w-[min(84vw,340px)] sm:w-[min(70vw,460px)]">
        <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square sizes="lg" shadow={false} className="shadow-[0_26px_50px_-18px_var(--t-shadow)]" />
      </div>
      <div className="mt-8 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="display line-clamp-2 text-[28px]">{book.title}</h1>
          <p className="mt-1 truncate text-[16px] font-medium text-t-ink-2">{shortAuthor(book.author)}{book.duration ? ` · ${formatDuration(book.duration * (1 - pct))}` : ""}</p>
        </div>
        <button
          type="button"
          onClick={() => void openAudioBook(book.id, { autoplay: true })}
          aria-label={t("Слушать")}
          className="flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full bg-t-btn text-t-btn-ink shadow-[0_10px_24px_-10px_var(--t-shadow)] transition-transform active:scale-95"
        >
          <PlayGlyph size={28} />
        </button>
      </div>
      <ProgressBar toned value={pct} className="mt-5 h-[3px]" />
    </div>
  );
}

function CompanionLink({ book, audio }: { book: BookRecord; audio: boolean }) {
  return (
    <Link prefetch={false} href={`/book/?id=${book.id}&mode=${audio ? "read" : "listen"}`}
      className={cn("inline-flex h-11 items-center gap-2 rounded-full bg-t-chip px-4 text-[14.5px] font-semibold", audio && "mt-4")}
    >
      {audio ? <BookOpen size={16} strokeWidth={2} /> : <Headphones size={16} strokeWidth={2} />}
      {audio ? t("Читать текстом") : t("Слушать аудиокнигу")}
    </Link>
  );
}

/** Other started books (most recent first), or the newest ones when nothing else is in progress. */
function ContinueRow({ exclude }: { exclude: (string | undefined)[] }) {
  const books = useBooks();
  const progress = useAllProgress();
  const { started, rest } = useMemo(() => {
    const list = (books ?? []).filter((b) => !exclude.includes(b.id));
    const pct = (b: BookRecord) => progress?.get(b.id)?.percentage ?? 0;
    const s = list.filter((b) => b.lastOpenedAt && pct(b) > 0 && pct(b) < 99.5).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
    return { started: s, rest: list.filter((b) => !s.includes(b)) };
  }, [books, progress, exclude]);
  const row = started.length ? started : rest;
  if (!row.length) return null;
  return (
    <section className="mx-auto mt-10 max-w-[600px] wide:max-w-[1180px]">
      <h2 className="px-5 text-[18px] font-bold sm:text-[20px] wide:px-10">{started.length ? t("Продолжить") : t("Ещё на полке")}</h2>
      <div className="no-scrollbar mt-3 flex items-end gap-3.5 overflow-x-auto px-5 pb-2 wide:px-10">
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
    <Link prefetch={false} href={`/book/?id=${book.id}`} aria-label={book.title} data-format={book.format} className={cn("rise block shrink-0", audio ? "w-[112px] sm:w-[140px]" : "w-[92px] sm:w-[116px]")} style={{ "--i": index } as CSSProperties}>
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
        <div className="mx-auto max-w-[600px] px-5 pt-12">
          <h1 className="display text-[38px] leading-[1.02]">{t("Здесь будет ваша книга")}</h1>
          <p className="mt-4 text-[17px] leading-[1.5] text-t-ink-2">
            {t("Добавьте PDF, FB2, EPUB или аудиокнигу — файлом, папкой или архивом. Всё хранится на телефоне и работает без интернета.")}
          </p>
          <div className="mt-8 grid gap-2.5">
            <Button variant="toned" size="lg" icon={<FilePlus2 size={19} strokeWidth={2} />} onClick={openFiles}>
              {t("Добавить файлы")}
            </Button>
            <Button variant="tonedSoft" size="lg" icon={<FolderPlus size={19} strokeWidth={2} />} onClick={openFolder}>
              {t("Папку с аудиокнигой")}
            </Button>
          </div>
        </div>
        <section className="mx-auto mt-12 max-w-[600px]">
          <div className="flex items-baseline justify-between px-5">
            <h2 className="text-[18px] font-bold">{t("Или возьмите в магазине")}</h2>
            <Link href="/store/" className="text-[14px] font-semibold text-t-ink-2">{t("Все")} {STORE_ITEMS.length}</Link>
          </div>
          <div className="no-scrollbar mt-3 flex items-end gap-3.5 overflow-x-auto px-5 pb-2">
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

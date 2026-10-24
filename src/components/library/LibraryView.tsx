"use client";

import { AudioLines, BookOpen, FilePlus2, FolderPlus, Headphones, ImageIcon, MoreHorizontal, Plus, Settings, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { useShallow } from "zustand/react/shallow";
import { VoiceoverSheet } from "@/components/integrations/VoiceoverSheet";
import { PauseGlyph, PlayGlyph } from "@/components/player/icons";
import { TopNav } from "@/components/shell/TopNav";
import { BookCover } from "@/components/ui/BookCover";
import { Button, ChipTabs, cn, ProgressBar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { openAudioBook, toggle, unloadIfCurrent, usePlayer } from "@/lib/audio/player";
import { useToned } from "@/lib/covers/tone";
import { FORMAT_LABELS, formatBytes, formatDuration } from "@/lib/format";
import { useCurrentBook, type CurrentBook } from "@/lib/library/current";
import { useAllProgress, useBooks, useChapterList } from "@/lib/library/hooks";
import { deleteBook } from "@/lib/library/repository";
import type { BookRecord, ProgressRecord } from "@/lib/storage/types";
import { CoverPicker } from "./CoverPicker";
import { DropTarget, ImportSheet, useImportPicker } from "./ImportPicker";

type Filter = "all" | "reading" | "listening" | "uploaded";

/** «Книги»: filters, the book you are on, then every book as a cover with its progress underneath. */
export function LibraryView() {
  const books = useBooks();
  const progress = useAllProgress();
  const current = useCurrentBook();
  const [filter, setFilter] = useState<Filter>("all");
  const [menuFor, setMenuFor] = useState<BookRecord | null>(null);
  const [coverFor, setCoverFor] = useState<BookRecord | null>(null);
  const [voiceFor, setVoiceFor] = useState<BookRecord | null>(null);
  const [adding, setAdding] = useState(false);
  const { inputs, openFiles, openFolder } = useImportPicker();

  const list = useMemo(() => books ?? [], [books]);
  const filtered = useMemo(() => {
    switch (filter) {
      case "reading": return list.filter((b) => b.format !== "audio");
      case "listening": return list.filter((b) => b.format === "audio");
      case "uploaded": return list.filter((b) => !b.isStoreBook);
      default: return list;
    }
  }, [list, filter]);

  const loading = books === undefined;
  const empty = !loading && list.length === 0;

  return (
    <DropTarget>
      <main className="mx-auto max-w-[1280px] pt-[calc(var(--sat)+14px)]">
        <TopNav />

        {empty ? (
          <EmptyState onFiles={openFiles} onFolder={openFolder} />
        ) : (
          <>
            <div className="mt-4 flex items-center gap-2 pl-5 pr-3 sm:mt-5 sm:pl-8 sm:pr-6">
              <ChipTabs
                className="min-w-0 flex-1"
                label="Фильтр книг"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "Все", count: list.length },
                  { value: "reading", label: "Читаю" },
                  { value: "listening", label: "Слушаю" },
                  { value: "uploaded", label: "Файлы" },
                ]}
              />
              <Link href="/settings/" aria-label="Настройки" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink active:bg-ink/5">
                <Settings size={21} strokeWidth={1.9} />
              </Link>
            </div>

            {filter === "all" && current && <ContinueCard current={current} />}

            <div className="grid grid-cols-3 items-end gap-x-3 gap-y-5 px-5 pt-5 sm:grid-cols-4 sm:gap-x-4 sm:gap-y-7 sm:px-8 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              <AddTile onClick={() => setAdding(true)} />
              {filtered.map((b, i) => (
                <GridItem key={b.id} book={b} progress={progress?.get(b.id)} index={i} onMenu={() => setMenuFor(b)} />
              ))}
            </div>
            {filtered.length === 0 && !loading && <p className="px-5 py-10 text-center text-[16px] text-ink-2">Здесь пока пусто.</p>}
          </>
        )}

        <ImportSheet open={adding} onClose={() => setAdding(false)} onFiles={openFiles} onFolder={openFolder} />
        <BookMenu book={menuFor} onClose={() => setMenuFor(null)} onCover={(b) => { setMenuFor(null); setCoverFor(b); }} onVoice={(b) => { setMenuFor(null); setVoiceFor(b); }} />
        <CoverPicker book={coverFor} onClose={() => setCoverFor(null)} />
        <VoiceoverSheet book={voiceFor} onClose={() => setVoiceFor(null)} />
        {inputs}
      </main>
    </DropTarget>
  );
}

/** The book you are on, in its own colour, with one big control. */
function ContinueCard({ current }: { current: CurrentBook }) {
  const { book, progress } = current;
  const router = useRouter();
  const { style } = useToned(book.coverFileId, book.coverUrl, "card");
  const chapters = useChapterList(book.id);
  const player = usePlayer(useShallow((s) => ({ bookId: s.bookId, isPlaying: s.isPlaying, chapterIndex: s.chapterIndex, position: s.position })));
  const audio = book.format === "audio";
  const loaded = audio && player.bookId === book.id;
  const pct = loaded && book.duration ? player.position / book.duration : (progress?.percentage ?? 0) / 100;
  const ci = loaded ? player.chapterIndex : progress?.currentChapterIndex ?? 0;
  const line = audio
    ? [chapters?.[ci]?.title, book.duration ? `ещё ${formatDuration(book.duration * (1 - pct))}` : null]
    : [book.totalChapters > 1 ? `глава ${ci + 1} из ${book.totalChapters}` : null, `${Math.round(pct * 100)}%`];

  const act = () => {
    if (!audio) return router.push(`/book/?id=${book.id}`);
    if (loaded) toggle();
    else void openAudioBook(book.id, { autoplay: true });
  };

  return (
    <div className="mx-5 mt-4 flex items-center gap-4 rounded-[22px] p-4 text-t-ink sm:mx-8 sm:gap-5 sm:p-5" style={{ ...style, background: "var(--t-bg)" }}>
      <Link prefetch={false} href={`/book/?id=${book.id}`} aria-label={book.title} className={cn("shrink-0", audio ? "w-[84px] sm:w-[112px]" : "w-[58px] sm:w-[76px]")}>
        <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square={audio} sizes="sm" className="shadow-[0_10px_20px_-8px_var(--t-shadow)]" shadow={false} />
      </Link>
      <Link prefetch={false} href={`/book/?id=${book.id}`} className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-t-ink-2">{pct > 0 ? (audio ? "Продолжить слушать" : "Продолжить чтение") : audio ? "Начать слушать" : "Начать читать"}</div>
        <div className="mt-0.5 truncate text-[21px] font-extrabold tracking-[-0.02em] sm:text-[26px]">{book.title}</div>
        <div className="truncate text-[14px] font-medium text-t-ink-2">{line.filter(Boolean).join(" · ")}</div>
      </Link>
      <button
        type="button"
        onClick={act}
        aria-label={audio ? (loaded && player.isPlaying ? "Пауза" : "Слушать") : "Читать"}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-t-btn text-t-btn-ink transition-transform active:scale-95"
      >
        {!audio ? <BookOpen size={21} strokeWidth={2.1} /> : loaded && player.isPlaying ? <PauseGlyph size={22} /> : <PlayGlyph size={22} />}
      </button>
    </div>
  );
}

function AddTile({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex aspect-[2/3] flex-col items-center justify-center gap-2 self-start rounded-[8px] border-2 border-dashed border-ink/15 text-ink-2 transition-colors active:bg-ink/5">
      <Plus size={28} strokeWidth={2} />
      <span className="px-2 text-center text-[13px] font-semibold leading-tight">Добавить<br />файлы</span>
    </button>
  );
}

function GridItem({ book, progress, index, onMenu }: { book: BookRecord; progress?: ProgressRecord; index: number; onMenu: () => void }) {
  const pct = (progress?.percentage ?? 0) / 100;
  const done = pct >= 0.995;
  const opened = !!book.lastOpenedAt || pct > 0;
  return (
    <div className="rise min-w-0" style={{ "--i": index } as CSSProperties}>
      <Link prefetch={false} href={`/book/?id=${book.id}`} data-format={book.format} aria-label={book.title} className="flex aspect-[2/3] items-end">
        <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square={book.format === "audio"} sizes="sm" className="w-full" />
      </Link>
      <ProgressBar value={pct} className="mt-2" color={done ? "var(--ink)" : undefined} />
      <div className="mt-1 flex items-center justify-between">
        <span className="tabular text-[12.5px] font-semibold text-ink-2">{done ? "Прочитано" : opened ? `${Math.round(pct * 100)}%` : "Новая"}</span>
        <button type="button" aria-label={`Действия: ${book.title}`} onClick={onMenu} className="-mr-1.5 flex h-7 w-8 items-center justify-center rounded-full text-ink-3 active:bg-ink/5">
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  );
}

function BookMenu({ book, onClose, onCover, onVoice }: { book: BookRecord | null; onClose: () => void; onCover: (b: BookRecord) => void; onVoice: (b: BookRecord) => void }) {
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setConfirm(false);
    onClose();
  };
  return (
    <Sheet open={!!book} onClose={close}>
      {book && (
        <div className="px-5 pb-2 pt-3">
          <div className="flex items-end gap-4">
            <div className={book.format === "audio" ? "w-20 shrink-0" : "w-16 shrink-0"}>
              <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} square={book.format === "audio"} sizes="sm" />
            </div>
            <div className="min-w-0 pb-0.5">
              <div className="text-[20px] font-extrabold leading-tight tracking-[-0.015em]">{book.title}</div>
              <div className="truncate text-[14px] text-ink-2">{book.author}</div>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-2">
            {[
              ["Формат", FORMAT_LABELS[book.format]],
              ["Размер", formatBytes(book.fileSize)],
              ["Главы", String(book.totalChapters)],
              [book.duration ? "Длительность" : "Страницы", book.duration ? formatDuration(book.duration) : book.pageCount ? String(book.pageCount) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[14px] bg-surface-2 px-3.5 py-2.5">
                <dt className="text-[12px] font-medium text-ink-2">{k}</dt>
                <dd className="tabular text-[15px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 grid gap-2">
            <Link prefetch={false} href={`/book/?id=${book.id}`} onClick={close}>
              <Button size="lg" className="w-full" icon={book.format === "audio" ? <Headphones size={18} /> : <BookOpen size={18} />}>
                {book.format === "audio" ? "Слушать" : "Читать"}
              </Button>
            </Link>
            {book.format !== "audio" && book.format !== "pdf" && !book.companionId && (
              <Button variant="secondary" size="lg" className="w-full" icon={<AudioLines size={18} strokeWidth={1.9} />} onClick={() => onVoice(book)}>
                Озвучить через ElevenLabs
              </Button>
            )}
            <Button variant="secondary" size="lg" className="w-full" icon={<ImageIcon size={18} strokeWidth={1.9} />} onClick={() => onCover(book)}>
              Обложка
            </Button>
            {!confirm ? (
              <Button variant="ghost" size="lg" className="w-full text-ink-2" icon={<Trash2 size={18} strokeWidth={1.9} />} onClick={() => setConfirm(true)}>
                Удалить с устройства
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                className="w-full text-[#B3261E] dark:text-[#F2B8B5]"
                icon={<Trash2 size={18} />}
                onClick={async () => {
                  unloadIfCurrent(book.id);
                  await deleteBook(book.id);
                  toast("Книга удалена");
                  close();
                }}
              >
                Точно удалить
              </Button>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function EmptyState({ onFiles, onFolder }: { onFiles: () => void; onFolder: () => void }) {
  return (
    <section className="px-5 pt-10 sm:px-8">
      <p className="display text-[30px]">Книг пока нет</p>
      <p className="mt-3 max-w-[420px] text-[16px] leading-[1.5] text-ink-2">
        Добавьте файлы или папку с аудиокнигой — или возьмите классику в магазине. Всё работает без интернета.
      </p>
      <div className="mt-7 grid max-w-[420px] gap-2.5">
        <Button size="lg" icon={<FilePlus2 size={19} strokeWidth={2} />} onClick={onFiles}>Добавить файлы</Button>
        <Button size="lg" variant="secondary" icon={<FolderPlus size={19} strokeWidth={2} />} onClick={onFolder}>Папку с аудиокнигой</Button>
        <Link href="/store/" className="mt-1"><Button size="lg" variant="ghost" className="w-full">Открыть магазин</Button></Link>
      </div>
    </section>
  );
}

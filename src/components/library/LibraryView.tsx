"use client";

import { ArrowRight, BookOpen, Headphones, ImageIcon, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { CatNo, cn, MetallicButton, ProgressBar, SectionHead, Tabs } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { openAudioBook, unloadIfCurrent, usePlayer } from "@/lib/audio/player";
import { FORMAT_LABELS, formatBytes, formatDuration, plural } from "@/lib/format";
import { useAllProgress, useBooks, useChapterList } from "@/lib/library/hooks";
import { deleteBook } from "@/lib/library/repository";
import type { BookRecord, ProgressRecord } from "@/lib/storage/types";
import { CoverPicker } from "./CoverPicker";
import { UploadDropzone } from "./UploadDropzone";

type Filter = "all" | "reading" | "listening" | "uploaded";

export function LibraryView() {
  const books = useBooks();
  const progress = useAllProgress();
  const [filter, setFilter] = useState<Filter>("all");
  const [menuFor, setMenuFor] = useState<BookRecord | null>(null);
  const [coverFor, setCoverFor] = useState<BookRecord | null>(null);

  const list = useMemo(() => books ?? [], [books]);
  const counts = {
    all: list.length,
    reading: list.filter((b) => b.format !== "audio").length,
    listening: list.filter((b) => b.format === "audio").length,
    uploaded: list.filter((b) => !b.isStoreBook).length,
  };
  const filtered = useMemo(() => {
    switch (filter) {
      case "reading": return list.filter((b) => b.format !== "audio");
      case "listening": return list.filter((b) => b.format === "audio");
      case "uploaded": return list.filter((b) => !b.isStoreBook);
      default: return list;
    }
  }, [list, filter]);

  const recent = useMemo(() => {
    const started = list.filter((b) => b.lastOpenedAt && (progress?.get(b.id)?.percentage ?? 0) < 99.5);
    return started.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0];
  }, [list, progress]);

  const loading = books === undefined;
  const empty = !loading && list.length === 0;
  const hours = list.reduce((s, b) => s + (b.duration ?? 0), 0) / 3600;

  return (
    <main className="mx-auto max-w-[760px] px-5 pt-[calc(var(--sat)+22px)]">
      <header className="flex items-end justify-between border-b border-rule pb-3">
        <h1 className="font-display text-[46px] leading-[0.9]">Полка</h1>
        {!loading && (
          <dl className="num grid grid-cols-[auto_auto] gap-x-3 text-right text-[10.5px] leading-[1.6] text-ink-2">
            <dt className="text-ink-3">книг</dt>
            <dd>{String(list.length).padStart(3, "0")}</dd>
            <dt className="text-ink-3">часов аудио</dt>
            <dd>{hours.toFixed(1).padStart(5, "0")}</dd>
          </dl>
        )}
      </header>

      {recent && <NowReading book={recent} progress={progress?.get(recent.id)} />}

      <div className="mt-6">
        <UploadDropzone compact={!empty} />
      </div>

      {empty ? (
        <EmptyState />
      ) : (
        <>
          <Tabs
            className="mt-8"
            layoutKey="library"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Все", count: counts.all },
              { value: "reading", label: "Читаю", count: counts.reading },
              { value: "listening", label: "Слушаю", count: counts.listening },
              { value: "uploaded", label: "Мои файлы", count: counts.uploaded },
            ]}
          />
          <Shelf books={filtered} progress={progress} onMenu={setMenuFor} />
          {filtered.length === 0 && !loading && <p className="py-12 text-center font-display text-[17px] italic text-ink-3">На этой полке пока пусто.</p>}
        </>
      )}

      <BookMenu book={menuFor} onClose={() => setMenuFor(null)} onCover={(b) => { setMenuFor(null); setCoverFor(b); }} />
      <CoverPicker book={coverFor} onClose={() => setCoverFor(null)} />
    </main>
  );
}

/** Books stand on shelf rails, three to a shelf, bottom-aligned whatever their proportions. */
function Shelf({ books, progress, onMenu }: { books: BookRecord[]; progress?: Map<string, ProgressRecord>; onMenu: (b: BookRecord) => void }) {
  const rows: BookRecord[][] = [];
  for (let i = 0; i < books.length; i += 3) rows.push(books.slice(i, i + 3));
  return (
    <div className="mt-2">
      {rows.map((row, r) => (
        <div key={r} className="pt-7">
          <div className="shelf grid grid-cols-3 items-end gap-x-5 px-1">
            {row.map((b, i) => (
              <Link key={b.id} href={`/book/?id=${b.id}`} data-format={b.format} aria-label={b.title} className="settle block" style={{ "--i": r * 3 + i } as React.CSSProperties}>
                <BookCover fileId={b.coverFileId} url={b.coverUrl} title={b.title} author={b.author} square={b.format === "audio"} sizes="sm" />
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-x-5 px-1 pt-2.5">
            {row.map((b, i) => {
              const pct = (progress?.get(b.id)?.percentage ?? 0) / 100;
              return (
                <div key={b.id} className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <CatNo n={r * 3 + i + 1} />
                    <button type="button" aria-label={`Действия: ${b.title}`} onClick={() => onMenu(b)} className="num -mr-1 px-1 text-[13px] leading-none text-ink-3 hover:text-ink">
                      ···
                    </button>
                  </div>
                  <Link href={`/book/?id=${b.id}`} data-format={b.format} className="block">
                    <div className="mt-1 line-clamp-2 text-[13px] leading-[1.25]">{b.title}</div>
                    <div className="mt-0.5 truncate text-[11.5px] text-ink-3">{b.author}</div>
                  </Link>
                  <div className="num mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-3">
                    <span>{b.format === "audio" ? "АУДИО" : FORMAT_LABELS[b.format]}</span>
                    <span className="h-px flex-1 bg-hairline" />
                    <span className={pct >= 0.995 ? "text-steel" : undefined}>{pct >= 0.995 ? "✓" : `${Math.round(pct * 100)}%`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function NowReading({ book, progress }: { book: BookRecord; progress?: ProgressRecord }) {
  const router = useRouter();
  const chapters = useChapterList(book.id);
  const pct = (progress?.percentage ?? 0) / 100;
  const isAudio = book.format === "audio";
  const chapter = chapters?.[progress?.currentChapterIndex ?? 0];
  const open = () => {
    if (isAudio) {
      void openAudioBook(book.id, { autoplay: true });
      usePlayer.getState().setExpanded(true);
    } else router.push(`/book/?id=${book.id}`);
  };
  return (
    <section className="mt-6">
      <SectionHead title={isAudio ? "Сейчас звучит" : "Сейчас читаю"} meta={`${Math.round(pct * 100)}%`} />
      <div className="mt-4 flex gap-5">
        <Link href={`/book/?id=${book.id}`} className={cn("shrink-0", isAudio ? "w-[104px]" : "w-[86px]")}>
          <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square={isAudio} sizes="sm" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="font-display text-[25px] leading-[1.05]">{book.title}</div>
          <div className="mt-1 truncate text-[13px] text-ink-2">{book.author}</div>
          <div className="mt-auto pt-3">
            <div className="num flex justify-between text-[10.5px] text-ink-3">
              <span className="truncate pr-2">{chapter?.title ?? "—"}</span>
              <span>{isAudio && book.duration ? `−${formatDuration(book.duration * (1 - pct))}` : `${(progress?.currentChapterIndex ?? 0) + 1}/${book.totalChapters}`}</span>
            </div>
            <ProgressBar value={pct} className="mt-1.5" />
            <button type="button" onClick={open} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink hover:text-steel">
              {isAudio ? "Продолжить слушать" : "Продолжить чтение"} <ArrowRight size={15} strokeWidth={1.6} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function BookMenu({ book, onClose, onCover }: { book: BookRecord | null; onClose: () => void; onCover: (b: BookRecord) => void }) {
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
              <div className="font-display text-[21px] leading-tight">{book.title}</div>
              <div className="truncate text-[13px] text-ink-2">{book.author}</div>
            </div>
          </div>
          <dl className="num mt-5 grid grid-cols-2 border-t border-hairline text-[11px]">
            {[
              ["формат", FORMAT_LABELS[book.format]],
              ["размер", formatBytes(book.fileSize)],
              ["главы", String(book.totalChapters)],
              [book.duration ? "длительность" : "страницы", book.duration ? formatDuration(book.duration) : book.pageCount ? String(book.pageCount) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-hairline py-2 pr-3 odd:border-r odd:pr-3 even:pl-3">
                <dt className="text-ink-3">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 grid gap-2">
            <Link href={`/book/?id=${book.id}`} onClick={close}>
              <MetallicButton className="w-full" icon={book.format === "audio" ? <Headphones size={16} /> : <BookOpen size={16} />}>
                Открыть
              </MetallicButton>
            </Link>
            <MetallicButton variant="secondary" className="w-full" icon={<ImageIcon size={16} strokeWidth={1.6} />} onClick={() => onCover(book)}>
              Обложка
            </MetallicButton>
            {!confirm ? (
              <MetallicButton variant="ghost" className="w-full text-ink-2" icon={<Trash2 size={16} strokeWidth={1.6} />} onClick={() => setConfirm(true)}>
                Удалить с устройства
              </MetallicButton>
            ) : (
              <MetallicButton
                variant="secondary"
                className="w-full border-ink/60"
                icon={<Trash2 size={16} />}
                onClick={async () => {
                  unloadIfCurrent(book.id);
                  await deleteBook(book.id);
                  toast("Книга удалена");
                  close();
                }}
              >
                Точно удалить
              </MetallicButton>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function EmptyState() {
  return (
    <section className="mt-12 border-y border-hairline py-12 text-center">
      <p className="font-display text-[28px] leading-tight">Полка пока пуста</p>
      <p className="mx-auto mt-3 max-w-[320px] text-[14px] leading-relaxed text-ink-2">
        Загрузите файлы или папку с аудиокнигой — или возьмите классику в магазине. Всё работает без интернета.
      </p>
      <Link href="/store/" className="mt-7 inline-block">
        <MetallicButton icon={<ArrowRight size={16} />}>В магазин</MetallicButton>
      </Link>
      <p className="num mt-6 text-[10.5px] text-ink-3">
        020 {plural(20, "издание", "издания", "изданий")} · общественное достояние
      </p>
    </section>
  );
}

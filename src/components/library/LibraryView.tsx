"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Headphones, MoreHorizontal, Store, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { cn, Eyebrow, IconButton, MetallicButton, ProgressBar, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { openAudioBook, unloadIfCurrent, usePlayer } from "@/lib/audio/player";
import { FORMAT_LABELS, formatBytes, formatDuration, plural } from "@/lib/format";
import { useAllProgress, useBooks } from "@/lib/library/hooks";
import { deleteBook } from "@/lib/library/repository";
import type { BookRecord, ProgressRecord } from "@/lib/storage/types";
import { UploadDropzone } from "./UploadDropzone";

type Filter = "all" | "reading" | "listening" | "uploaded";

export function LibraryView() {
  const books = useBooks();
  const progress = useAllProgress();
  const [filter, setFilter] = useState<Filter>("all");
  const [menuFor, setMenuFor] = useState<BookRecord | null>(null);

  const filtered = useMemo(() => {
    const list = books ?? [];
    switch (filter) {
      case "reading": return list.filter((b) => b.format !== "audio");
      case "listening": return list.filter((b) => b.format === "audio");
      case "uploaded": return list.filter((b) => !b.isStoreBook);
      default: return list;
    }
  }, [books, filter]);

  const recent = useMemo(() => {
    const started = (books ?? []).filter((b) => b.lastOpenedAt && (progress?.get(b.id)?.percentage ?? 0) < 99.5);
    return started.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))[0];
  }, [books, progress]);

  const loading = books === undefined;
  const empty = !loading && books.length === 0;

  return (
    <main className="mx-auto max-w-[960px] px-5 pt-[calc(var(--sat)+28px)]">
      <header className="flex items-end justify-between">
        <div>
          <Eyebrow>Titan</Eyebrow>
          <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.035em]">Моя полка</h1>
        </div>
        {!empty && !loading && (
          <span className="pb-1 text-[13px] text-ink-2 tabular">
            {books.length} {plural(books.length, "книга", "книги", "книг")}
          </span>
        )}
      </header>

      {recent && <ContinueCard book={recent} progress={progress?.get(recent.id)} />}

      <div className="mt-6">
        <UploadDropzone compact={!empty} />
      </div>

      {empty ? (
        <EmptyState />
      ) : (
        <>
          <div className="no-scrollbar -mx-5 mt-7 overflow-x-auto px-5">
            <Segmented
              layoutKey="library-filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "Все" },
                { value: "reading", label: "Читаю" },
                { value: "listening", label: "Слушаю" },
                { value: "uploaded", label: "Загружено" },
              ]}
            />
          </div>
          {filter === "uploaded" && <p className="mt-2 text-[12px] text-ink-3">Файлы, загруженные с этого устройства.</p>}

          <motion.ul layout className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4">
            <AnimatePresence initial={false}>
              {filtered.map((b) => (
                <motion.li key={b.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
                  <BookTile book={b} progress={progress?.get(b.id)} onMenu={() => setMenuFor(b)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
          {filtered.length === 0 && !loading && <p className="py-12 text-center text-[14px] text-ink-3">В этом разделе пока пусто.</p>}
        </>
      )}

      <BookMenu book={menuFor} onClose={() => setMenuFor(null)} />
    </main>
  );
}

function ContinueCard({ book, progress }: { book: BookRecord; progress?: ProgressRecord }) {
  const router = useRouter();
  const pct = (progress?.percentage ?? 0) / 100;
  const isAudio = book.format === "audio";
  const open = () => {
    if (isAudio) {
      void openAudioBook(book.id, { autoplay: true });
      usePlayer.getState().setExpanded(true);
    } else router.push(`/book/?id=${book.id}`);
  };
  return (
    <section className="mt-6 flex items-center gap-4 rounded-[24px] p-4 metal-card">
      <Link href={`/book/?id=${book.id}`} className="w-[72px] shrink-0">
        <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square={isAudio} sizes="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        <Eyebrow>{isAudio ? "Продолжить слушать" : "Продолжить читать"}</Eyebrow>
        <div className="mt-1 truncate text-[16px] font-semibold tracking-[-0.01em]">{book.title}</div>
        <div className="truncate text-[13px] text-ink-2">{book.author}</div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <ProgressBar value={pct} className="flex-1" />
          <span className="text-[12px] text-ink-2 tabular">{Math.round(pct * 100)}%</span>
        </div>
      </div>
      <MetallicButton size="sm" className="h-10 px-4" onClick={open} icon={isAudio ? <Headphones size={15} /> : <BookOpen size={15} />}>
        {isAudio ? "Слушать" : "Читать"}
      </MetallicButton>
    </section>
  );
}

function BookTile({ book, progress, onMenu }: { book: BookRecord; progress?: ProgressRecord; onMenu: () => void }) {
  const pct = (progress?.percentage ?? 0) / 100;
  const isAudio = book.format === "audio";
  return (
    <div className="group">
      <Link href={`/book/?id=${book.id}`} className="block">
        <div className={cn("relative", isAudio && "pt-[50%]")}>
          <BookCover
            fileId={book.coverFileId}
            url={book.coverUrl}
            title={book.title}
            author={book.author}
            square={isAudio}
            badge={
              <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-white/90 backdrop-blur-md">
                {isAudio && <Headphones size={9} />}
                {FORMAT_LABELS[book.format]}
              </span>
            }
          />
        </div>
      </Link>
      <div className="mt-2.5 flex items-start gap-1">
        <Link href={`/book/?id=${book.id}`} className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[14px] font-medium leading-snug tracking-[-0.01em]">{book.title}</div>
          <div className="mt-0.5 truncate text-[12px] text-ink-2">{book.author}</div>
        </Link>
        <IconButton label="Действия" size={28} className="-mr-1 text-ink-3" onClick={onMenu}>
          <MoreHorizontal size={17} />
        </IconButton>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <ProgressBar value={pct} className="flex-1" />
        <span className="text-[11px] text-ink-3 tabular">{pct >= 0.995 ? "✓" : `${Math.round(pct * 100)}%`}</span>
      </div>
    </div>
  );
}

function BookMenu({ book, onClose }: { book: BookRecord | null; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setConfirm(false);
    onClose();
  };
  return (
    <Sheet open={!!book} onClose={close}>
      {book && (
        <div className="px-5 pb-2 pt-2">
          <div className="flex items-center gap-4">
            <div className="w-14 shrink-0">
              <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} square={book.format === "audio"} sizes="sm" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold">{book.title}</div>
              <div className="truncate text-[13px] text-ink-2">{book.author}</div>
              <div className="mt-1 text-[12px] text-ink-3 tabular">
                {FORMAT_LABELS[book.format]} · {formatBytes(book.fileSize)} · {book.totalChapters} {plural(book.totalChapters, "глава", "главы", "глав")}
                {book.duration ? ` · ${formatDuration(book.duration)}` : ""}
                {book.pageCount ? ` · ${book.pageCount} стр.` : ""}
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            <Link href={`/book/?id=${book.id}`} onClick={close}>
              <MetallicButton variant="secondary" className="w-full" icon={book.format === "audio" ? <Headphones size={16} /> : <BookOpen size={16} />}>
                Открыть
              </MetallicButton>
            </Link>
            {!confirm ? (
              <MetallicButton variant="ghost" className="w-full text-ink-2" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>
                Удалить с устройства
              </MetallicButton>
            ) : (
              <MetallicButton
                className="w-full"
                icon={<Trash2 size={16} />}
                onClick={async () => {
                  unloadIfCurrent(book.id);
                  await deleteBook(book.id);
                  toast("Книга удалена", "info");
                  close();
                }}
              >
                Подтвердить удаление
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
    <section className="mt-10 rounded-[26px] px-6 py-10 text-center metal-card brushed">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-steel">
        <BookOpen size={26} strokeWidth={1.6} />
      </div>
      <h2 className="mt-4 text-[20px] font-semibold tracking-[-0.02em]">Полка пока пуста</h2>
      <p className="mx-auto mt-2 max-w-[340px] text-[14px] leading-relaxed text-ink-2">
        Загрузите свои файлы или скачайте классику из магазина — книги и аудиокниги работают без интернета.
      </p>
      <Link href="/store/" className="mt-6 inline-block">
        <MetallicButton icon={<Store size={16} />}>Открыть магазин</MetallicButton>
      </Link>
    </section>
  );
}

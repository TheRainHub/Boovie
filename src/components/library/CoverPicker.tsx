"use client";

import { ImageUp, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Button, cn, SectionTitle, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { generateCover } from "@/lib/covers/generate";
import { downloadCover, searchCovers, type CoverCandidate } from "@/lib/covers/lookup";
import { cleanTitle } from "@/lib/covers/names";
import { setBookCover } from "@/lib/library/repository";
import type { BookRecord } from "@/lib/storage/types";

/** Pick a cover: search Apple Books / Google Books / Open Library by name, use your own image, or generate one. */
export function CoverPicker({ book, onClose }: { book: BookRecord | null; onClose: () => void }) {
  return (
    <Sheet open={!!book} onClose={onClose} title="Обложка" full>
      {book && <Picker key={book.id} book={book} onDone={onClose} />}
    </Sheet>
  );
}

function Picker({ book, onDone }: { book: BookRecord; onDone: () => void }) {
  const square = book.format === "audio";
  const initial = [cleanTitle(book.title), /неизвестн/i.test(book.author) ? "" : book.author].filter(Boolean).join(" — ");
  const [query, setQuery] = useState(initial);
  const [state, setState] = useState<{ loading: boolean; results: CoverCandidate[]; searched: boolean }>({ loading: false, results: [], searched: false });
  const [applying, setApplying] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const run = useCallback(async (q: string) => {
    const [title, author] = q.split(/\s+[—–-]\s+/);
    setState((s) => ({ ...s, loading: true }));
    const results = await searchCovers({ title: title ?? q, author, kind: square ? "audio" : "text" }).catch(() => []);
    setState({ loading: false, results, searched: true });
  }, [square]);

  useEffect(() => {
    // Search once on open (state updates happen after the network round-trip).
    const t = setTimeout(() => void run(initial), 0);
    return () => clearTimeout(t);
  }, [initial, run]);

  const apply = async (c: CoverCandidate) => {
    setApplying(c.id);
    const blob = (await downloadCover(c.full)) ?? (await downloadCover(c.thumb));
    if (blob) {
      await setBookCover(book.id, { blob }, "user");
      toast("Обложка сохранена на устройстве", "success");
    } else {
      // The host does not allow cross-origin reads: keep it as a linked image (shown when online).
      await setBookCover(book.id, { url: c.full }, "user");
      toast("Обложка подключена по ссылке — без интернета будет показана заглушка", "info");
    }
    setApplying(null);
    onDone();
  };

  return (
    <div className="px-5 pb-6 pt-4">
      <div className="flex items-end gap-4">
        <div className={cn("shrink-0", square ? "w-24" : "w-20")}>
          <BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} author={book.author} square={square} sizes="sm" />
        </div>
        <div className="min-w-0 pb-1">
          <div className="text-[19px] font-extrabold leading-tight tracking-[-0.015em]">{book.title}</div>
          <div className="mt-0.5 text-[14px] text-ink-2">{book.author}</div>
          <div className="mt-1.5 text-[13px] text-ink-3">Сейчас: {sourceLabel(book.coverSource)}</div>
        </div>
      </div>

      <form
        className="mt-5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[14px] bg-surface-2 px-3.5">
          <Search size={17} strokeWidth={2.1} className="shrink-0 text-ink-2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Название и автор" placeholder="Название — автор" className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-ink-3" enterKeyHint="search" />
        </label>
        <Button type="submit">Найти</Button>
      </form>

      <SectionTitle className="mt-6" title="Найдено" action={state.loading ? "поиск…" : state.results.length} as="h3" />
      {state.loading ? (
        <div className="flex justify-center py-10"><Spinner className="text-ink-2" /></div>
      ) : state.results.length === 0 ? (
        <p className="py-6 text-[15px] leading-relaxed text-ink-2">
          {state.searched ? "Ничего не нашлось. Уточните название или проверьте подключение к интернету." : "Поиск по Apple Books, Google Books и Open Library."}
        </p>
      ) : (
        <ul className={cn("mt-4 grid gap-x-3 gap-y-5", square ? "grid-cols-3" : "grid-cols-4")}>
          {state.results.slice(0, 24).map((c) => (
            <li key={c.id}>
              <button type="button" disabled={!!applying} onClick={() => void apply(c)} className="block w-full text-left disabled:opacity-60">
                <div className={cn("relative overflow-hidden rounded-[6px] bg-surface-2 shadow-[var(--cover-shadow)]", c.square ? "aspect-square" : "aspect-[2/3]")}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote catalogue thumbnails */}
                  <img src={c.thumb} alt={c.title} loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
                  {applying === c.id && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><Spinner className="text-white" /></div>}
                </div>
                <div className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-snug">{c.title}</div>
                <div className="mt-0.5 text-[11.5px] text-ink-3">{c.source}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-7 grid grid-cols-2 gap-2">
        <Button variant="secondary" icon={<ImageUp size={17} strokeWidth={2} />} onClick={() => fileInput.current?.click()}>
          Свой файл
        </Button>
        <Button
          variant="secondary"
          icon={<RefreshCw size={16} strokeWidth={2} />}
          onClick={async () => {
            const blob = await generateCover({ title: book.title, author: book.author, square, label: square ? "Аудиокнига" : book.format.toUpperCase() });
            await setBookCover(book.id, { blob }, "generated");
            onDone();
          }}
        >
          Сгенерировать
        </Button>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          await setBookCover(book.id, { blob: f }, "user");
          toast("Обложка обновлена", "success");
          onDone();
        }}
      />
    </div>
  );
}

function sourceLabel(s: BookRecord["coverSource"]): string {
  return { embedded: "из файла", folder: "из папки", store: "магазин", online: "найдена по названию", generated: "сгенерирована", user: "выбрана вами" }[s ?? "embedded"] ?? "—";
}

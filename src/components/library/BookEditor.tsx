"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { refreshPlayerInfo } from "@/lib/audio/player";
import { refreshGeneratedCover } from "@/lib/covers/auto";
import { splitAuthorTitle, tidyName } from "@/lib/covers/names";
import { useChapterList } from "@/lib/library/hooks";
import { updateBookInfo } from "@/lib/library/repository";
import { getDB } from "@/lib/storage/db";
import type { BookRecord } from "@/lib/storage/types";

const UNKNOWN = "Неизвестный автор";
const field = "h-12 w-full rounded-[14px] bg-surface-2 px-4 text-[16px] font-medium outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-ink/15";

/** Title, author, narrator and chapter names, for books whose tags or file names got them wrong. */
export function BookEditor({ book, onClose }: { book: BookRecord | null; onClose: () => void }) {
  return (
    <Sheet open={!!book} onClose={onClose} labelledBy="book-editor-title">
      {book && <EditorForm key={book.id} book={book} onClose={onClose} />}
    </Sheet>
  );
}

function EditorForm({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  const audio = book.format === "audio";
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author === UNKNOWN ? "" : book.author);
  const [narrator, setNarrator] = useState(book.narrator ?? "");
  const [edits, setEdits] = useState<Map<number, string>>(new Map());
  const [saving, setSaving] = useState(false);
  const chapters = useChapterList(book.id);
  const fileNames = useLiveQuery(async () => (await getDB().files.bulkGet(book.sourceFileIds)).flatMap((f) => (f ? [f.name] : [])), [book.id]);

  // A single source file may name the book better than its tags: offer its name, with and without the author part.
  const fromFile = fileNames?.length === 1 ? fileNames[0] : undefined;
  const split = fromFile ? splitAuthorTitle(fromFile, true) : null;
  const suggestions = [...new Set([fromFile && tidyName(fromFile), split?.title].filter((s): s is string => !!s && s !== title.trim()))];

  const save = async () => {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const renamed = new Map([...edits].map(([i, v]) => [i, v.trim()] as const).filter(([i, v]) => v && v !== chapters?.find((c) => c.index === i)?.title));
      await updateBookInfo(book.id, { title: t, author: author.trim() || UNKNOWN, narrator: narrator.trim() }, renamed);
      await refreshPlayerInfo(book.id);
      void refreshGeneratedCover(book.id, () => void refreshPlayerInfo(book.id)).catch(() => undefined);
      toast("Сохранено", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <form
      className="px-5 pb-4 pt-2"
      onSubmit={(e) => {
        // The keyboard's return key only closes the keyboard: several chapters can be renamed before saving.
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="book-editor-title" className="display text-[24px]">Название и автор</h2>
        <Button size="sm" disabled={!title.trim() || saving} onClick={() => void save()}>Готово</Button>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Название</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Название" className={field} enterKeyHint="done" />
      </label>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTitle(s);
                if (split && s === split.title && !author.trim()) setAuthor(split.author);
              }}
              className="flex max-w-full items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1.5 text-left text-[13.5px] font-medium text-ink-2 active:opacity-80"
            >
              <FileText size={14} strokeWidth={2} className="shrink-0" />
              <span className="truncate">Из имени файла: <span className="text-ink">{s}</span></span>
            </button>
          ))}
        </div>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Автор</span>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Автор" placeholder={UNKNOWN} className={field} enterKeyHint="done" />
      </label>
      {audio && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">Читает</span>
          <input value={narrator} onChange={(e) => setNarrator(e.target.value)} aria-label="Читает" placeholder="Чтец" className={field} enterKeyHint="done" />
        </label>
      )}

      {!!chapters?.length && (
        <section className="mt-7">
          <h3 className="text-[13px] font-semibold text-ink-2">{audio ? "Главы и части" : "Главы"} · {chapters.length}</h3>
          <ol className="mt-2 grid gap-1.5">
            {chapters.map((c) => (
              <li key={c.index} className="flex items-center gap-2.5">
                <span className="tabular w-7 shrink-0 text-right text-[13px] text-ink-3">{c.index + 1}</span>
                <input
                  value={edits.get(c.index) ?? c.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEdits((m) => new Map(m).set(c.index, v));
                  }}
                  aria-label={`Глава ${c.index + 1}`}
                  className="h-10 min-w-0 flex-1 rounded-[12px] bg-surface-2 px-3 text-[15px] font-medium outline-none focus:ring-2 focus:ring-ink/15"
                  enterKeyHint="done"
                />
              </li>
            ))}
          </ol>
        </section>
      )}

      <Button size="lg" className="mt-6 w-full" disabled={!title.trim() || saving} onClick={() => void save()}>Сохранить</Button>
    </form>
  );
}

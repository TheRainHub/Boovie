"use client";

import { Check, Download, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Button, ChipTabs, cn, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { downloadEntry, fetchFeed, libraryFeedUrl, ownedEntries, useLibrarr } from "@/lib/integrations/librarr";
import { formatLabel, isSupportedType, type OpdsEntry } from "@/lib/integrations/opds";
import { t } from "@/lib/i18n";

type Kind = "all" | "ebook" | "audiobook";
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е"); // i18n-ignore

/** The store's «Librarr» section: the server's library, page by page, with a download button per book. */
export function LibrarrShelf() {
  const configured = useLibrarr((s) => !!s.url);
  const [kind, setKind] = useState<Kind>("all");
  const [state, setState] = useState<{ entries: OpdsEntry[]; next?: string; total?: number; loading: boolean; error?: string }>({ entries: [], loading: true });
  const [owned, setOwned] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const load = useCallback(async (href: string, append: boolean) => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const feed = await fetchFeed(href);
      setState((s) => ({ entries: append ? [...s.entries, ...feed.entries] : feed.entries, next: feed.next, total: feed.total, loading: false }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, []);

  useEffect(() => {
    if (!configured) return;
    const t = setTimeout(() => void load(libraryFeedUrl(kind === "all" ? undefined : kind), false), 0);
    void ownedEntries().then(setOwned);
    return () => clearTimeout(t);
  }, [configured, kind, load]);

  const shown = useMemo(() => {
    const q = norm(query.trim());
    return q ? state.entries.filter((e) => norm(`${e.title} ${e.author ?? ""}`).includes(q)) : state.entries;
  }, [state.entries, query]);

  if (!configured) {
    return (
      <section className="px-5 pt-8 sm:px-8">
        <p className="display text-[24px]">{t("Librarr не подключён")}</p>
        <p className="mt-2 max-w-[460px] text-[15px] leading-relaxed text-ink-2">{t("Укажите адрес сервера и ключ в настройках — и ваша библиотека Librarr появится здесь.")}</p>
        <Link href="/settings/"><Button className="mt-5">{t("Открыть настройки")}</Button></Link>
      </section>
    );
  }

  const get = async (e: OpdsEntry) => {
    setBusy((b) => new Set(b).add(e.id));
    try {
      const id = await downloadEntry(e);
      if (id) {
        setOwned(await ownedEntries());
        toast(t("«{title}» в ваших книгах", { title: e.title }), "success");
      }
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(e.id);
        return n;
      });
    }
  };

  return (
    <section className="px-5 pt-4 sm:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <ChipTabs label={t("Тип")} value={kind} onChange={setKind} options={[{ value: "all", label: t("Всё") }, { value: "ebook", label: t("Книги") }, { value: "audiobook", label: t("Аудио") }]} />
        <label className="flex h-9 min-w-[180px] flex-1 items-center gap-2 rounded-full bg-surface-2 px-3.5 sm:max-w-[320px]">
          <Search size={16} className="shrink-0 text-ink-2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("Найти в загруженном")} aria-label={t("Поиск по библиотеке Librarr")} className="min-w-0 flex-1 bg-transparent text-[14.5px] font-medium outline-none placeholder:text-ink-3" />
        </label>
      </div>
      {state.total !== undefined && <p className="tabular mt-3 text-[13.5px] text-ink-2">{t("В библиотеке Librarr: {n}", { n: state.total })}</p>}
      {state.error && <p className="mt-4 rounded-[16px] bg-surface-2 p-4 text-[14.5px] leading-relaxed">{state.error}</p>}

      <ul className="mt-3 grid grid-cols-1 gap-x-8 md:grid-cols-2">
        {shown.map((e) => {
          const type = e.acquisitions[0]?.type ?? e.formats[0] ?? "";
          // Librarr serves FB2 as octet-stream; its dc:format says what the file really is.
          const shownType = e.formats.find((t) => !/octet-stream/i.test(t)) ?? type;
          const supported = !!e.acquisitions.length && isSupportedType(shownType || "octet-stream");
          const mine = owned.get(e.id);
          const audio = /audio|mp3|m4b/i.test(shownType);
          return (
            <li key={e.id} className="flex min-w-0 items-center gap-3.5 border-b border-line py-3 last:border-b-0">
              <div className={cn("shrink-0", audio ? "w-[56px]" : "w-[44px]")}>
                <BookCover url={e.cover} title={e.title} author={e.author} square={audio} sizes="sm" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-bold">{e.title}</div>
                <div className="truncate text-[14px] text-ink-2">{[e.author, shownType ? formatLabel(shownType) : null, supported ? null : t("не открывается в Boowie")].filter(Boolean).join(" · ")}</div>
              </div>
              {mine ? (
                <Link prefetch={false} href={`/book/?id=${mine}`} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-3.5 text-[14px] font-semibold">
                  <Check size={15} /> {t("Открыть")}
                </Link>
              ) : supported ? (
                <Button size="sm" variant="secondary" className="shrink-0" disabled={busy.has(e.id)} onClick={() => void get(e)} icon={busy.has(e.id) ? <Spinner size={15} /> : <Download size={15} strokeWidth={2.2} />} aria-label={t("Скачать: {title}", { title: e.title })}>
                  {t("Скачать")}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {state.loading && <div className="flex justify-center py-8"><Spinner className="text-ink-2" /></div>}
      {!state.loading && state.next && (
        <Button variant="secondary" className="mt-4" onClick={() => void load(state.next!, true)}>{t("Показать ещё")}</Button>
      )}
      {!state.loading && !state.error && !shown.length && <p className="py-10 text-center text-[15px] text-ink-2">{query ? t("Ничего не найдено") : t("В библиотеке Librarr пока пусто")}</p>}
    </section>
  );
}

"use client";

import { BookOpen, Download, Headphones, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { LibrarrShelf } from "@/components/integrations/LibrarrShelf";
import { TopNav } from "@/components/shell/TopNav";
import { BookCover } from "@/components/ui/BookCover";
import { ChipTabs, cn, SectionTitle } from "@/components/ui/primitives";
import { authorOf, categoryName, searchText, STORE_ITEMS, storeItem, type CategoryId, type StoreItem } from "@/data/catalog";
import { useToned } from "@/lib/covers/tone";
import { useLibrarr } from "@/lib/integrations/librarr";
import { formatDuration } from "@/lib/format";
import { BookDetailsSheet } from "./BookDetailsSheet";
import { StoreCard } from "./StoreCard";
import { useStoreActions } from "./useStoreActions";
import { t } from "@/lib/i18n";

type Tab = "overview" | "librarr" | "audio" | "ebooks" | "top" | "new" | `cat:${CategoryId}`;
const CHIP_ORDER: CategoryId[] = ["classics", "scifi", "detective", "adventure", "psychology", "science", "bio", "design", "tech"];
const FEATURED = ["anna-karenina", "viy-audio", "bratya-karamazovy", "sherlock-holmes", "pikovaya-dama"];
const FRESH = 12;

// Letters and digits only: «о генри» finds «О. Генри», «доктор джекил» finds «Dr. Jekyll».
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim(); // i18n-ignore

export function StoreView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const { owned } = useStoreActions();
  const librarr = useLibrarr((s) => !!s.url);

  // Deep link from the home screen: /store/?item=<id>
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("item");
    const item = storeItem(id ?? undefined);
    if (!item) return;
    const t = setTimeout(() => setSelected(item), 0);
    return () => clearTimeout(t);
  }, []);

  const q = norm(query.trim());
  const searching = q.length > 0;
  const list = useMemo(() => {
    // Books are found by their names in either language: «Гэтсби», «Конан Дойл», «Anna Karenina».
    const found = STORE_ITEMS.filter((i) => !q || norm(searchText(i)).includes(q));
    if (tab.startsWith("cat:")) return found.filter((i) => i.categories.includes(tab.slice(4) as CategoryId));
    switch (tab) {
      case "audio": return found.filter((i) => i.kind === "audiobook");
      case "ebooks": return found.filter((i) => i.kind === "ebook");
      case "top": return [...found].sort((a, b) => a.rank - b.rank);
      case "new": return [...found].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
      default: return found;
    }
  }, [tab, q]);

  return (
    <main className="mx-auto max-w-[1280px] pt-[calc(var(--sat)+14px)]">
      <TopNav />

      <div className={cn("px-5 sm:px-8", tab === "librarr" && "hidden")}>
        <label className="mt-4 flex h-11 sm:max-w-[560px] items-center gap-2.5 rounded-[14px] bg-surface-2 px-3.5">
          <Search size={18} strokeWidth={2.1} className="shrink-0 text-ink-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Название или автор")}
            aria-label={t("Поиск по каталогу")}
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-ink-3"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" aria-label={t("Очистить")} onClick={() => setQuery("")} className="text-ink-2">
              <X size={18} />
            </button>
          )}
        </label>
      </div>

      <ChipTabs
        className="mt-3 px-5 sm:px-8"
        label={t("Разделы магазина")}
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: t("Обзор") },
          ...(librarr ? [{ value: "librarr" as Tab, label: "Librarr" }] : []),
          { value: "audio", label: t("Аудиокниги") },
          { value: "ebooks", label: t("Электронные") },
          { value: "top", label: t("Топ") },
          { value: "new", label: t("Новинки") },
          ...CHIP_ORDER.map((c) => ({ value: `cat:${c}` as Tab, label: categoryName(c) })),
        ]}
      />

      {tab === "librarr" ? (
        <LibrarrShelf />
      ) : tab === "overview" && !searching ? (
        <Overview onSelect={setSelected} owned={owned} onNew={() => setTab("new")} />
      ) : tab === "top" ? (
        <TopChart items={list} onSelect={setSelected} className="mt-4 px-5 sm:px-8 md:grid md:grid-cols-2 md:gap-x-10" />
      ) : (
        <section className="px-5 pt-5 sm:px-8">
          {searching && <SectionTitle title={t("Найдено")} action={list.length} />}
          {list.length === 0 && <p className="py-12 text-center text-[16px] text-ink-2">{t("Ничего не найдено")}</p>}
          <div className="mt-3 grid grid-cols-3 items-start gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
            {list.map((i, n) => (
              <StoreCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => setSelected(i)} index={n} />
            ))}
          </div>
        </section>
      )}

      <BookDetailsSheet item={selected} onClose={() => setSelected(null)} onSelect={setSelected} />
    </main>
  );
}

function Overview({ onSelect, owned, onNew }: { onSelect: (i: StoreItem) => void; owned?: Map<string, string>; onNew: () => void }) {
  const featured = FEATURED.map((id) => storeItem(id)!).filter(Boolean);
  const audio = STORE_ITEMS.filter((i) => i.kind === "audiobook");
  const ru = STORE_ITEMS.filter((i) => i.kind === "ebook" && i.language === "ru");
  const en = STORE_ITEMS.filter((i) => i.language === "en");
  const top = [...STORE_ITEMS].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const fresh = [...STORE_ITEMS].sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.rank - b.rank).slice(0, FRESH);
  const pair = [storeItem("pikovaya-dama")!, storeItem("pikovaya-dama-audio")!];

  return (
    <div className="pt-4">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 sm:scroll-px-8 sm:gap-4 sm:px-8">
        {featured.map((i) => (
          <FeaturedCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => onSelect(i)} />
        ))}
      </div>

      <Rail title={t("Новые поступления")} items={fresh} onSelect={onSelect} owned={owned} onAll={onNew} />
      <Rail title={t("Аудиокниги")} items={audio} onSelect={onSelect} owned={owned} />

      <button type="button" onClick={() => onSelect(pair[0])} className="mx-5 mt-9 flex w-[calc(100%-40px)] items-center gap-4 rounded-[22px] bg-surface-2 p-4 text-left active:opacity-85 sm:mx-8 sm:w-[calc(100%-64px)] sm:max-w-[640px]">
        <div className="flex shrink-0 items-end">
          <div className="w-[54px]"><BookCover url={pair[0].coverUrl} title={pair[0].title} sizes="sm" /></div>
          <div className="-ml-3 w-[66px]"><BookCover url={pair[1].coverUrl} title={pair[1].title} square sizes="sm" /></div>
        </div>
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold tracking-[-0.015em]">{t("Читать и слушать")}</div>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">{t("Текст и аудиокнига одной книги: переключайтесь с той же главы.")}</p>
        </div>
      </button>

      <section className="mt-9 px-5 sm:px-8">
        <SectionTitle title={t("Топ")} action={5} />
        <TopChart items={top} onSelect={onSelect} className="mt-2 md:grid md:grid-cols-2 md:gap-x-10" />
      </section>

      <Rail title={t("Русская классика")} items={ru} onSelect={onSelect} owned={owned} />
      <Rail title={t("На английском")} items={en} onSelect={onSelect} owned={owned} />
      <p className="px-5 pb-4 pt-10 text-[13px] leading-relaxed text-ink-3 sm:px-8">
        {t("Все книги — общественное достояние: авторы и переводчики умерли больше 70 лет назад, книги изданы до 1931 года. Русская классика — из открытого корпуса русской прозы, английские издания — Standard Ebooks (CC0). Аудиокниги озвучены RHVoice.")}
      </p>
    </div>
  );
}

/** Large card in the colour of its cover. */
function FeaturedCard({ item, owned, onOpen }: { item: StoreItem; owned?: boolean; onOpen: () => void }) {
  const { style } = useToned(undefined, item.coverUrl, "card");
  const audio = item.kind === "audiobook";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${audio ? t("Аудиокнига недели") : t("Выбор редакции")}: ${item.title}`}
      className="relative isolate flex h-[212px] w-[86%] shrink-0 snap-start items-center gap-4 overflow-hidden rounded-[24px] px-5 text-left text-t-ink active:opacity-90 sm:h-[240px] sm:w-[62%] md:w-[47%] xl:w-[32.4%]"
      style={{ ...style, background: "var(--t-bg)" } as CSSProperties}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-t-ink-2">{audio ? t("Аудиокнига недели") : t("Выбор редакции")}</div>
        <div className="display mt-1.5 line-clamp-3 text-[25px]">{item.title}</div>
        <div className="mt-1 truncate text-[14px] font-medium text-t-ink-2">
          {authorOf(item)} · {audio && item.duration ? formatDuration(item.duration) : item.formatLabel}
        </div>
        <span className="mt-3.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-t-btn px-4 text-[14px] font-semibold text-t-btn-ink">
          {owned ? (audio ? <Headphones size={15} strokeWidth={2.2} /> : <BookOpen size={15} strokeWidth={2.2} />) : <Download size={15} strokeWidth={2.2} />}
          {owned ? (audio ? t("Слушать") : t("Читать")) : t("Скачать")}
        </span>
      </div>
      <div className={cn("shrink-0 rotate-[3deg]", audio ? "w-[128px]" : "w-[108px]")}>
        <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="sm" shadow={false} className="shadow-[0_18px_30px_-10px_var(--t-shadow)]" />
      </div>
    </button>
  );
}

/** A horizontal shelf. With `onAll` it shows a slice and links to the full list ("Все") instead of counting. */
function Rail({ title, items, onSelect, owned, onAll }: { title: string; items: StoreItem[]; onSelect: (i: StoreItem) => void; owned?: Map<string, string>; onAll?: () => void }) {
  return (
    <section className="mt-9">
      <SectionTitle
        className="px-5 sm:px-8"
        title={title}
        action={onAll ? <button type="button" onClick={onAll} className="underline-offset-2 hover:underline">{t("Все")}</button> : `${t("Все")} ${items.length}`}
      />
      <div className="no-scrollbar mt-3 flex snap-x items-start gap-3.5 overflow-x-auto scroll-px-5 px-5 sm:scroll-px-8 sm:gap-5 sm:px-8">
        {items.map((i) => (
          <StoreCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => onSelect(i)} rail />
        ))}
      </div>
    </section>
  );
}

function TopChart({ items, onSelect, className }: { items: StoreItem[]; onSelect: (i: StoreItem) => void; className?: string }) {
  return (
    <ol className={className}>
      {items.map((i, n) => (
        <li key={i.id}>
          <button type="button" onClick={() => onSelect(i)} className="flex w-full items-center gap-3.5 py-2.5 text-left">
            <span className="display tabular w-7 shrink-0 text-[24px] text-ink-3">{n + 1}</span>
            <div className={cn("shrink-0", i.kind === "audiobook" ? "w-[56px]" : "w-[42px]")}>
              <BookCover url={i.coverUrl} title={i.title} square={i.kind === "audiobook"} sizes="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[16px] font-bold">{i.title}</div>
              <div className="truncate text-[14px] text-ink-2">{authorOf(i)}</div>
            </div>
            <div className="tabular shrink-0 text-right text-[13px] text-ink-2">
              {i.kind === "audiobook" && i.duration ? formatDuration(i.duration) : i.formatLabel}
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

"use client";

import { BookOpen, Download, Headphones, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { TopNav } from "@/components/shell/TopNav";
import { BookCover } from "@/components/ui/BookCover";
import { ChipTabs, cn, SectionTitle } from "@/components/ui/primitives";
import { CATEGORIES, STORE_ITEMS, storeItem, type CategoryId, type StoreItem } from "@/data/catalog";
import { useToned } from "@/lib/covers/tone";
import { formatDuration } from "@/lib/format";
import { BookDetailsSheet } from "./BookDetailsSheet";
import { StoreCard } from "./StoreCard";
import { useStoreActions } from "./useStoreActions";

type Tab = "overview" | "audio" | "ebooks" | "top" | "new" | `cat:${CategoryId}`;
const CHIP_ORDER: CategoryId[] = ["classics", "scifi", "psychology", "design", "tech", "bio"];
const FEATURED = ["anna-karenina", "viy-audio", "time-machine", "pikovaya-dama"];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

export function StoreView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const { owned } = useStoreActions();

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
    const found = STORE_ITEMS.filter((i) => !q || norm(`${i.title} ${i.author} ${i.subtitle ?? ""}`).includes(q));
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
    <main className="mx-auto max-w-[760px] pt-[calc(var(--sat)+14px)]">
      <TopNav />

      <div className="px-5">
        <label className="mt-4 flex h-11 items-center gap-2.5 rounded-[14px] bg-surface-2 px-3.5">
          <Search size={18} strokeWidth={2.1} className="shrink-0 text-ink-2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название или автор"
            aria-label="Поиск по каталогу"
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-ink-3"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-ink-2">
              <X size={18} />
            </button>
          )}
        </label>
      </div>

      <ChipTabs
        className="mt-3 px-5"
        label="Разделы магазина"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Обзор" },
          { value: "audio", label: "Аудиокниги" },
          { value: "ebooks", label: "Электронные" },
          { value: "top", label: "Топ" },
          { value: "new", label: "Новинки" },
          ...CHIP_ORDER.map((c) => ({ value: `cat:${c}` as Tab, label: CATEGORIES[c] })),
        ]}
      />

      {tab === "overview" && !searching ? (
        <Overview onSelect={setSelected} owned={owned} />
      ) : tab === "top" ? (
        <TopChart items={list} onSelect={setSelected} className="mt-4 px-5" />
      ) : (
        <section className="px-5 pt-5">
          {searching && <SectionTitle title="Найдено" action={list.length} />}
          {list.length === 0 && <p className="py-12 text-center text-[16px] text-ink-2">Ничего не найдено</p>}
          <div className="mt-3 grid grid-cols-3 items-start gap-x-3 gap-y-6 sm:grid-cols-4">
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

function Overview({ onSelect, owned }: { onSelect: (i: StoreItem) => void; owned?: Map<string, string> }) {
  const featured = FEATURED.map((id) => storeItem(id)!).filter(Boolean);
  const audio = STORE_ITEMS.filter((i) => i.kind === "audiobook");
  const ru = STORE_ITEMS.filter((i) => i.kind === "ebook" && i.language === "ru");
  const en = STORE_ITEMS.filter((i) => i.language === "en");
  const top = [...STORE_ITEMS].sort((a, b) => a.rank - b.rank).slice(0, 5);
  const pair = [storeItem("pikovaya-dama")!, storeItem("pikovaya-dama-audio")!];

  return (
    <div className="pt-4">
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5">
        {featured.map((i) => (
          <FeaturedCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => onSelect(i)} />
        ))}
      </div>

      <Rail title="Аудиокниги" items={audio} onSelect={onSelect} owned={owned} />

      <button type="button" onClick={() => onSelect(pair[0])} className="mx-5 mt-9 flex w-[calc(100%-40px)] items-center gap-4 rounded-[22px] bg-surface-2 p-4 text-left active:opacity-85">
        <div className="flex shrink-0 items-end">
          <div className="w-[54px]"><BookCover url={pair[0].coverUrl} title={pair[0].title} sizes="sm" /></div>
          <div className="-ml-3 w-[66px]"><BookCover url={pair[1].coverUrl} title={pair[1].title} square sizes="sm" /></div>
        </div>
        <div className="min-w-0">
          <div className="text-[18px] font-extrabold tracking-[-0.015em]">Читать и слушать</div>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">Текст и аудиокнига одной книги: переключайтесь с той же главы.</p>
        </div>
      </button>

      <section className="mt-9 px-5">
        <SectionTitle title="Топ" action={5} />
        <TopChart items={top} onSelect={onSelect} className="mt-2" />
      </section>

      <Rail title="Русская классика" items={ru} onSelect={onSelect} owned={owned} />
      <Rail title="На английском" items={en} onSelect={onSelect} owned={owned} />
      <p className="px-5 pb-4 pt-10 text-[13px] leading-relaxed text-ink-3">
        Все книги — общественное достояние. Русская классика — из открытого корпуса русской прозы, английские издания — Standard Ebooks (CC0). Аудиокниги озвучены RHVoice.
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
      aria-label={`${audio ? "Аудиокнига недели" : "Выбор редакции"}: ${item.title}`}
      className="flex h-[212px] w-[calc(100vw-56px)] max-w-[560px] shrink-0 snap-start items-center gap-4 overflow-hidden rounded-[24px] px-5 text-left text-t-ink active:opacity-90"
      style={{ ...style, background: "var(--t-bg)" } as CSSProperties}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-t-ink-2">{audio ? "Аудиокнига недели" : "Выбор редакции"}</div>
        <div className="display mt-1.5 line-clamp-3 text-[25px]">{item.title}</div>
        <div className="mt-1 truncate text-[14px] font-medium text-t-ink-2">
          {item.author} · {audio && item.duration ? formatDuration(item.duration) : item.formatLabel}
        </div>
        <span className="mt-3.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-t-btn px-4 text-[14px] font-semibold text-t-btn-ink">
          {owned ? (audio ? <Headphones size={15} strokeWidth={2.2} /> : <BookOpen size={15} strokeWidth={2.2} />) : <Download size={15} strokeWidth={2.2} />}
          {owned ? (audio ? "Слушать" : "Читать") : "Скачать"}
        </span>
      </div>
      <div className={cn("shrink-0 rotate-[3deg]", audio ? "w-[128px]" : "w-[108px]")}>
        <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="sm" shadow={false} className="shadow-[0_18px_30px_-10px_var(--t-shadow)]" />
      </div>
    </button>
  );
}

function Rail({ title, items, onSelect, owned }: { title: string; items: StoreItem[]; onSelect: (i: StoreItem) => void; owned?: Map<string, string> }) {
  return (
    <section className="mt-9">
      <SectionTitle className="px-5" title={title} action={`Все ${items.length}`} />
      <div className="no-scrollbar mt-3 flex snap-x items-start gap-3.5 overflow-x-auto scroll-px-5 px-5">
        {items.map((i) => (
          <StoreCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => onSelect(i)} width={i.kind === "audiobook" ? 132 : 106} />
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
              <div className="truncate text-[14px] text-ink-2">{i.author}</div>
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

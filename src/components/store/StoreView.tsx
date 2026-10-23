"use client";

import { ArrowRight, Headphones, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Chip, cn, Eyebrow, glassClasses, MetallicButton } from "@/components/ui/primitives";
import { CATEGORIES, STORE_ITEMS, storeItem, type CategoryId, type StoreItem } from "@/data/catalog";
import { formatDuration } from "@/lib/format";
import { BookDetailsSheet } from "./BookDetailsSheet";
import { StoreCard } from "./StoreCard";
import { useStoreActions } from "./useStoreActions";

type Tab = "overview" | "audio" | "ebooks" | "top" | "new" | "free";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "audio", label: "Аудиокниги" },
  { id: "ebooks", label: "Электронные книги" },
  { id: "top", label: "Топ чарты" },
  { id: "new", label: "Новинки" },
  { id: "free", label: "Бесплатная классика" },
];
const CHIP_ORDER: CategoryId[] = ["scifi", "design", "psychology", "classics", "tech", "bio"];
const FEATURED = ["pikovaya-dama", "anna-karenina", "time-machine", "viy-audio"];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

export function StoreView() {
  const [tab, setTab] = useState<Tab>("overview");
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StoreItem | null>(null);
  const { owned } = useStoreActions();

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    return STORE_ITEMS.filter((i) => (!category || i.categories.includes(category)) && (!q || norm(`${i.title} ${i.author} ${i.subtitle ?? ""}`).includes(q)));
  }, [category, query]);

  const searching = query.trim().length > 0;
  const list = useMemo(() => {
    switch (tab) {
      case "audio": return filtered.filter((i) => i.kind === "audiobook");
      case "ebooks": return filtered.filter((i) => i.kind === "ebook");
      case "top": return [...filtered].sort((a, b) => a.rank - b.rank);
      case "new": return [...filtered].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
      case "free": return filtered.filter((i) => i.categories.includes("classics"));
      default: return filtered;
    }
  }, [tab, filtered]);

  return (
    <main className="mx-auto max-w-[960px] pt-[calc(var(--sat)+28px)]">
      <header className="px-5">
        <Eyebrow>Каталог</Eyebrow>
        <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.035em]">Магазин</h1>
        <label className={cn(glassClasses, "mt-5 flex h-11 items-center gap-2.5 rounded-2xl px-3.5")}>
          <Search size={17} className="shrink-0 text-ink-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Название или автор"
            aria-label="Поиск по каталогу"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-ink-3">
              <X size={16} />
            </button>
          )}
        </label>
      </header>

      <nav className="no-scrollbar mt-4 flex gap-5 overflow-x-auto border-b border-hairline px-5" aria-label="Разделы магазина">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn("relative shrink-0 whitespace-nowrap pb-2.5 pt-1 text-[14.5px] font-medium transition-colors", tab === t.id ? "text-ink" : "text-ink-3")}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-steel" />}
          </button>
        ))}
      </nav>

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-4">
        {CHIP_ORDER.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORIES[c]}
          </Chip>
        ))}
      </div>

      {tab === "overview" && !searching && !category ? (
        <Overview onSelect={setSelected} owned={owned} />
      ) : tab === "top" ? (
        <TopChart items={list} onSelect={setSelected} />
      ) : (
        <section className="px-5 pt-6">
          <div className="text-[13px] text-ink-2 tabular">{list.length ? `Найдено: ${list.length}` : "Ничего не найдено"}</div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-5">
            {list.map((i) => (
              <StoreCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => setSelected(i)} />
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
  const fresh = [...STORE_ITEMS].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, 3);
  const pair = [storeItem("pikovaya-dama")!, storeItem("pikovaya-dama-audio")!];

  return (
    <div className="pt-6">
      {/* Featured carousel */}
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pb-2">
        {featured.map((i) => (
          <button
            type="button"
            key={i.id}
            onClick={() => onSelect(i)}
            className="relative flex w-[86%] max-w-[560px] shrink-0 snap-start items-end gap-4 overflow-hidden rounded-[26px] p-5 text-left metal-card brushed sm:w-[62%]"
          >
            <div className={cn("relative z-10 shrink-0", i.kind === "audiobook" ? "w-[42%]" : "w-[36%]")}>
              <BookCover url={i.coverUrl} title={i.title} author={i.author} square={i.kind === "audiobook"} />
            </div>
            <div className="relative z-10 min-w-0 flex-1 pb-1">
              <Eyebrow>{i.kind === "audiobook" ? "Аудиокнига недели" : "Выбор редакции"}</Eyebrow>
              <div className="mt-1.5 text-[19px] font-semibold leading-tight tracking-[-0.02em]">{i.title}</div>
              <div className="mt-0.5 text-[13px] text-ink-2">{i.author}</div>
              <p className="mt-2 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{i.synopsis}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-steel">
                Подробнее <ArrowRight size={13} />
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Bento */}
      <div className="mt-5 grid grid-cols-2 gap-3 px-5 md:grid-cols-4">
        <button type="button" onClick={() => onSelect(pair[0])} className="col-span-2 flex items-center gap-4 rounded-[24px] p-4 text-left metal-card">
          <div className="relative h-[104px] w-[118px] shrink-0">
            <div className="absolute left-0 top-0 w-[66px]"><BookCover url={pair[0].coverUrl} title={pair[0].title} sizes="sm" /></div>
            <div className="absolute bottom-0 right-0 w-[72px]"><BookCover url={pair[1].coverUrl} title={pair[1].title} square sizes="sm" /></div>
          </div>
          <div className="min-w-0">
            <Eyebrow>Читать ↔ Слушать</Eyebrow>
            <div className="mt-1 text-[16px] font-semibold leading-tight tracking-[-0.01em]">Одна книга — два формата</div>
            <p className="mt-1 text-[12.5px] leading-snug text-ink-2">Начните читать «Пиковую даму» и продолжите слушать с той же главы.</p>
          </div>
        </button>
        <div className="col-span-1 rounded-[24px] p-4 metal-card">
          <Eyebrow>Топ-5</Eyebrow>
          <ol className="mt-2 space-y-1.5">
            {top.map((i, n) => (
              <li key={i.id}>
                <button type="button" onClick={() => onSelect(i)} className="flex w-full items-baseline gap-2 text-left">
                  <span className="w-3 shrink-0 text-[12px] font-semibold text-steel tabular">{n + 1}</span>
                  <span className="truncate text-[13px]">{i.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="col-span-1 flex flex-col justify-between rounded-[24px] p-4 metal-card">
          <Eyebrow>Новинки</Eyebrow>
          <div className="mt-3 flex -space-x-5">
            {fresh.map((i) => (
              <button type="button" key={i.id} onClick={() => onSelect(i)} className="w-[46px]">
                <BookCover url={i.coverUrl} title={i.title} square={i.kind === "audiobook"} sizes="sm" />
              </button>
            ))}
          </div>
          <div className="mt-3 text-[12px] text-ink-2">Добавлено на этой неделе</div>
        </div>
      </div>

      <Shelf title="Аудиокниги" subtitle="Синтез речи RHVoice · главы, закладки, таймер сна" items={audio} onSelect={onSelect} owned={owned} icon={<Headphones size={14} />} />
      <Shelf title="Русская классика" subtitle="FB2, EPUB и PDF — с автоматическим оглавлением" items={ru} onSelect={onSelect} owned={owned} />
      <Shelf title="На английском" subtitle="Издания Standard Ebooks" items={en} onSelect={onSelect} owned={owned} />
    </div>
  );
}

function Shelf({ title, subtitle, items, onSelect, owned, icon }: { title: string; subtitle?: string; items: StoreItem[]; onSelect: (i: StoreItem) => void; owned?: Map<string, string>; icon?: React.ReactNode }) {
  return (
    <section className="mt-9">
      <div className="px-5">
        <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-[-0.02em]">{icon}{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-3">{subtitle}</p>}
      </div>
      <div className="no-scrollbar mt-4 flex snap-x gap-4 overflow-x-auto scroll-px-5 px-5 pb-1">
        {items.map((i) => (
          <StoreCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => onSelect(i)} width={132} />
        ))}
      </div>
    </section>
  );
}

function TopChart({ items, onSelect }: { items: StoreItem[]; onSelect: (i: StoreItem) => void }) {
  return (
    <ol className="mt-4 divide-y divide-hairline px-5">
      {items.map((i, n) => (
        <li key={i.id}>
          <button type="button" onClick={() => onSelect(i)} className="flex w-full items-center gap-4 py-3 text-left">
            <span className="w-7 shrink-0 text-center text-[17px] font-semibold text-steel tabular">{n + 1}</span>
            <div className={cn("shrink-0", i.kind === "audiobook" ? "w-[54px]" : "w-[44px]")}>
              <BookCover url={i.coverUrl} title={i.title} square={i.kind === "audiobook"} sizes="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-medium tracking-[-0.01em]">{i.title}</div>
              <div className="truncate text-[12.5px] text-ink-2">{i.author}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-3 tabular">
                {i.kind === "audiobook" && i.duration ? `Аудио · ${formatDuration(i.duration)}` : i.formatLabel} · ★ {i.rating.toLocaleString("ru-RU")}
              </div>
            </div>
            <MetallicButton variant="secondary" size="sm" tabIndex={-1} className="pointer-events-none">
              Открыть
            </MetallicButton>
          </button>
        </li>
      ))}
    </ol>
  );
}

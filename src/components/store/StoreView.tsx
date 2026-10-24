"use client";

import { ArrowRight, Search, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Chip, cn, SectionHead, Tabs } from "@/components/ui/primitives";
import { CATEGORIES, STORE_ITEMS, storeItem, type CategoryId, type StoreItem } from "@/data/catalog";
import { formatDuration } from "@/lib/format";
import { BookDetailsSheet } from "./BookDetailsSheet";
import { StoreCard } from "./StoreCard";
import { useStoreActions } from "./useStoreActions";

type Tab = "overview" | "audio" | "ebooks" | "top" | "new" | "free";
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

  const audioCount = STORE_ITEMS.filter((i) => i.kind === "audiobook").length;

  return (
    <main className="mx-auto max-w-[760px] pt-[calc(var(--sat)+22px)]">
      <header className="mx-5 flex items-end justify-between border-b border-rule pb-3">
        <h1 className="font-display text-[46px] leading-[0.9]">Магазин</h1>
        <dl className="num grid grid-cols-[auto_auto] gap-x-3 text-right text-[10.5px] leading-[1.6] text-ink-2">
          <dt className="text-ink-3">изданий</dt>
          <dd>{String(STORE_ITEMS.length).padStart(3, "0")}</dd>
          <dt className="text-ink-3">аудиокниг</dt>
          <dd>{String(audioCount).padStart(3, "0")}</dd>
        </dl>
      </header>

      <div className="px-5">
        <label className="mt-5 flex h-11 items-center gap-2.5 rounded-[4px] border border-ink/20 px-3 focus-within:border-ink/50">
          <Search size={16} strokeWidth={1.6} className="shrink-0 text-ink-3" />
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
      </div>

      <Tabs
        className="mt-5 px-5"
        layoutKey="store"
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Обзор" },
          { value: "audio", label: "Аудиокниги" },
          { value: "ebooks", label: "Электронные книги" },
          { value: "top", label: "Топ чарты" },
          { value: "new", label: "Новинки" },
          { value: "free", label: "Бесплатная классика" },
        ]}
      />

      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-5 pt-4">
        {CHIP_ORDER.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
            {CATEGORIES[c]}
          </Chip>
        ))}
      </div>

      {tab === "overview" && !searching && !category ? (
        <Overview onSelect={setSelected} owned={owned} />
      ) : tab === "top" ? (
        <TopChart items={list} onSelect={setSelected} className="mt-6 px-5" />
      ) : (
        <section className="px-5 pt-6">
          <SectionHead title={searching ? "Результаты" : "Каталог"} meta={String(list.length).padStart(3, "0")} />
          {list.length === 0 && <p className="py-10 text-center font-display text-[17px] italic text-ink-3">Ничего не найдено</p>}
          <div className="mt-1 grid grid-cols-3 gap-y-6 sm:grid-cols-4">
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
  const rail = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);

  return (
    <div className="pt-6">
      {/* Featured: asymmetric spreads — a large cover breaking out of a ruled frame, the copy set beside it. */}
      <div
        ref={rail}
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {featured.map((i, n) => {
          const audioItem = i.kind === "audiobook";
          return (
            <button type="button" key={i.id} onClick={() => onSelect(i)} className="w-full shrink-0 snap-start px-5 text-left">
              <div className="grid grid-cols-[42%_1fr] gap-5">
                <div className="relative pt-5">
                  <div className="absolute inset-x-[-6px] bottom-[-10px] top-0 rounded-[2px] border border-hairline bg-surface" />
                  <div className="relative">
                    <BookCover url={i.coverUrl} title={i.title} author={i.author} square={audioItem} />
                  </div>
                </div>
                <div className="flex min-w-0 flex-col">
                  <div className="num flex items-center gap-2 text-[10.5px] text-ink-3">
                    <span>{audioItem ? "АУДИОКНИГА НЕДЕЛИ" : "ВЫБОР РЕДАКЦИИ"}</span>
                    <span className="h-px flex-1 bg-hairline" />
                    <span>{String(n + 1).padStart(2, "0")}/{String(featured.length).padStart(2, "0")}</span>
                  </div>
                  <div className="mt-3 font-display text-[30px] leading-[1]">{i.title}</div>
                  <div className="mt-1.5 font-display text-[16px] italic text-ink-2">{i.author}</div>
                  <p className="mt-3 line-clamp-4 text-[13px] leading-[1.45] text-ink-2">{i.synopsis}</p>
                  <div className="num mt-auto flex items-center gap-1.5 pt-3 text-[10.5px] text-ink-3">
                    <span>{i.year > 1000 ? i.year : `~${i.year}`}</span>
                    <span>·</span>
                    <span>{audioItem && i.duration ? formatDuration(i.duration) : i.formatLabel}</span>
                    <ArrowRight size={13} className="ml-auto text-ink" strokeWidth={1.6} />
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-6 flex items-center gap-1.5 px-5" aria-hidden>
        {featured.map((f, n) => (
          <span key={f.id} className={cn("h-[2px] transition-all duration-300", n === slide ? "w-8 bg-ink" : "w-3 bg-ink/20")} />
        ))}
      </div>

      {/* Read ↔ Listen spread */}
      <button type="button" onClick={() => onSelect(pair[0])} className="mx-5 mt-9 grid w-[calc(100%-40px)] grid-cols-[auto_1fr] items-center gap-5 border-y border-hairline py-5 text-left">
        <div className="flex items-end gap-2">
          <div className="w-[58px]"><BookCover url={pair[0].coverUrl} title={pair[0].title} sizes="sm" /></div>
          <span className="num pb-6 text-[13px] text-ink-3">↔</span>
          <div className="w-[70px]"><BookCover url={pair[1].coverUrl} title={pair[1].title} square sizes="sm" /></div>
        </div>
        <div>
          <div className="font-display text-[20px] italic leading-tight">Читать и слушать</div>
          <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">Две редакции одной книги: переключайтесь между текстом и голосом с той же главы.</p>
        </div>
      </button>

      <section className="mt-10 px-5">
        <SectionHead title="Топ чарты" meta="05" />
        <TopChart items={top} onSelect={onSelect} />
      </section>

      <Rail title="Аудиокниги" items={audio} onSelect={onSelect} owned={owned} />
      <Rail title="Русская классика" items={ru} onSelect={onSelect} owned={owned} />
      <Rail title="На английском" items={en} onSelect={onSelect} owned={owned} />
    </div>
  );
}

function Rail({ title, items, onSelect, owned }: { title: string; items: StoreItem[]; onSelect: (i: StoreItem) => void; owned?: Map<string, string> }) {
  return (
    <section className="mt-11">
      <SectionHead className="px-5" title={title} meta={String(items.length).padStart(3, "0")} />
      <div className="no-scrollbar mt-1 flex snap-x overflow-x-auto scroll-px-5 px-[14px]">
        {items.map((i) => (
          <StoreCard key={i.id} item={i} owned={owned?.has(i.id)} onOpen={() => onSelect(i)} width={128} />
        ))}
      </div>
    </section>
  );
}

function TopChart({ items, onSelect, className }: { items: StoreItem[]; onSelect: (i: StoreItem) => void; className?: string }) {
  return (
    <ol className={cn("mt-2", className)}>
      {items.map((i, n) => (
        <li key={i.id} className="border-b border-hairline last:border-b-0">
          <button type="button" onClick={() => onSelect(i)} className="flex w-full items-center gap-4 py-3.5 text-left">
            <span className="w-9 shrink-0 font-display text-[38px] leading-none text-ink/80">{n + 1}</span>
            <div className={cn("shrink-0", i.kind === "audiobook" ? "w-[50px]" : "w-[38px]")}>
              <BookCover url={i.coverUrl} title={i.title} square={i.kind === "audiobook"} sizes="sm" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-[18px] leading-tight">{i.title}</div>
              <div className="truncate text-[12.5px] text-ink-2">{i.author}</div>
            </div>
            <div className="num shrink-0 text-right text-[10.5px] leading-[1.6] text-ink-3">
              <div>{i.kind === "audiobook" && i.duration ? formatDuration(i.duration) : i.formatLabel}</div>
              <div className="text-ink-2">{i.rating.toFixed(1).replace(".", ",")}</div>
            </div>
          </button>
        </li>
      ))}
    </ol>
  );
}

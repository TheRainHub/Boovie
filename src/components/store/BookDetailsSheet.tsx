"use client";

import { ArrowRight, BookOpen, Download, Headphones, Pause, Play } from "lucide-react";
import { BookCover } from "@/components/ui/BookCover";
import { cn, MetallicButton, ProgressBar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { CATEGORIES, storeItem, type StoreItem } from "@/data/catalog";
import { stopPreview, togglePreview, usePreview } from "@/lib/audio/preview";
import { formatBytes, formatDuration } from "@/lib/format";
import { useStoreActions } from "./useStoreActions";

/** Five graduated marks: the editorial score as a gauge, not stars. */
function Gauge({ value }: { value: number }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-label={`Оценка редакции ${value} из 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block h-[10px] w-[5px] bg-track">
            <span className="absolute inset-x-0 bottom-0 bg-ink" style={{ height: `${fill * 100}%` }} />
          </span>
        );
      })}
    </span>
  );
}

export function BookDetailsSheet({ item, onClose, onSelect }: { item: StoreItem | null; onClose: () => void; onSelect: (i: StoreItem) => void }) {
  const { owned, jobFor, download, open } = useStoreActions();
  const preview = usePreview();
  const close = () => {
    stopPreview();
    onClose();
  };

  return (
    <Sheet open={!!item} onClose={close} full>
      {item && <Details key={item.id} item={item} owned={owned?.has(item.id) ?? false} job={jobFor(item)} preview={preview} onDownload={() => void download(item)} onOpen={() => void open(item).then(close)} onSelect={onSelect} />}
    </Sheet>
  );
}

function Details({
  item, owned, job, preview, onDownload, onOpen, onSelect,
}: {
  item: StoreItem;
  owned: boolean;
  job?: { progress: number; stage: string };
  preview: ReturnType<typeof usePreview.getState>;
  onDownload: () => void;
  onOpen: () => void;
  onSelect: (i: StoreItem) => void;
}) {
  const audio = item.kind === "audiobook";
  const companion = storeItem(item.companion);
  const sampleSource = audio ? item : companion?.kind === "audiobook" ? companion : undefined;
  const sampling = preview.itemId === sampleSource?.id;

  const facts: [string, string][] = [
    ["Год", item.year > 1000 ? String(item.year) : `ок. ${item.year}`],
    ["Формат", item.formatLabel],
    ["Размер", formatBytes(item.fileSize)],
    audio && item.duration ? ["Длительность", formatDuration(item.duration)] : ["Объём", item.pages ? `${item.pages} стр.` : "—"],
    ["Главы", item.chapterCount ? String(item.chapterCount) : "по заголовкам"],
    ["Язык", item.language === "ru" ? "русский" : "английский"],
    ...(item.narrator ? ([["Голос", item.narrator]] as [string, string][]) : []),
  ];

  return (
    <div className="mx-auto max-w-[560px] px-6 pb-6">
      <div className="num flex items-center gap-2 pt-3 text-[10.5px] text-ink-3">
        <span>{item.categories.map((c) => CATEGORIES[c].toUpperCase()).join(" / ")}</span>
        <span className="h-px flex-1 bg-hairline" />
        <span>№ {String(item.rank).padStart(3, "0")}</span>
      </div>

      <div className={cn("mx-auto mt-7 [perspective:1100px]", audio ? "w-[min(60vw,240px)]" : "w-[min(50vw,200px)]")}>
        <div className="transition-transform duration-700 ease-[var(--ease-machined)] [transform:rotateY(-12deg)_rotateX(3deg)] hover:[transform:none]">
          <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="lg" reflect />
        </div>
      </div>

      <div className="mt-[64px] text-center">
        <h2 className="font-display text-[34px] leading-[1.02]">{item.title}</h2>
        {item.subtitle && <p className="mt-1.5 font-display text-[15px] italic text-ink-2">{item.subtitle}</p>}
        <p className="mt-2 font-display text-[17px] italic text-ink-2">
          {item.author}
          {item.translator ? `, пер. ${item.translator}` : ""}
        </p>
        <div className="num mt-4 flex items-center justify-center gap-2.5 text-[11px] text-ink-2">
          <Gauge value={item.rating} />
          <span>{item.rating.toFixed(1).replace(".", ",")}</span>
          <span className="text-ink-3">оценка редакции</span>
        </div>
      </div>

      <div className="mt-7 grid gap-2">
        {owned ? (
          <MetallicButton size="lg" className="w-full" icon={audio ? <Headphones size={18} strokeWidth={1.6} /> : <BookOpen size={18} strokeWidth={1.6} />} onClick={onOpen}>
            {audio ? "Слушать" : "Читать"}
          </MetallicButton>
        ) : job ? (
          <div className="rounded-[4px] border border-ink/20 px-4 py-3">
            <div className="num flex justify-between text-[11px]"><span>{job.stage}</span><span>{Math.round(job.progress * 100)}%</span></div>
            <ProgressBar value={job.progress} className="mt-2" />
          </div>
        ) : (
          <MetallicButton size="lg" className="w-full" icon={<Download size={18} strokeWidth={1.6} />} onClick={onDownload}>
            Скачать в библиотеку
          </MetallicButton>
        )}
        {sampleSource && (
          <MetallicButton
            variant="secondary"
            size="lg"
            className="w-full"
            icon={sampling && preview.playing ? <Pause size={17} strokeWidth={1.6} /> : <Play size={17} strokeWidth={1.6} />}
            onClick={() => togglePreview(sampleSource.id, sampleSource.files[0].url)}
          >
            <span>{sampling && preview.playing ? "Пауза" : "Слушать фрагмент"}</span>
            {sampling && <ProgressBar value={preview.progress} ticks={false} className="ml-2 w-16" />}
          </MetallicButton>
        )}
        {owned && <p className="num mt-1 text-center text-[10.5px] text-ink-3">сохранено на устройстве · доступно офлайн</p>}
      </div>

      {companion && (
        <button type="button" onClick={() => onSelect(companion)} className="mt-7 flex w-full items-center gap-4 border-y border-hairline py-4 text-left">
          <div className={companion.kind === "audiobook" ? "w-12 shrink-0" : "w-10 shrink-0"}>
            <BookCover url={companion.coverUrl} title={companion.title} square={companion.kind === "audiobook"} sizes="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] italic">{companion.kind === "audiobook" ? "Есть аудиоверсия" : "Есть текст"}</div>
            <div className="text-[12.5px] text-ink-2">Скачайте обе — и переключайтесь «Читать / Слушать» с той же главы.</div>
          </div>
          <ArrowRight size={16} strokeWidth={1.6} className="shrink-0 text-ink-3" />
        </button>
      )}

      <p
        className={cn(
          "mt-7 font-serif text-[17px] leading-[1.6] [text-wrap:pretty]",
          // Drop cap only when the text opens with a letter (not a «quotation»).
          /^\p{L}/u.test(item.synopsis) && "first-letter:float-left first-letter:mr-1.5 first-letter:font-display first-letter:text-[52px] first-letter:leading-[0.85]",
        )}
      >
        {item.synopsis}
      </p>

      <dl className="mt-8 border-t border-rule">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5">
            <dt className="text-[12.5px] text-ink-3">{k}</dt>
            <dd className="num truncate text-right text-[11.5px]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
        Общественное достояние. {item.language === "en" ? "Текст — Standard Ebooks (CC0)." : "Текст — открытый корпус русской прозы."}
        {audio ? " Озвучено синтезатором речи RHVoice." : ""}
      </p>
    </div>
  );
}

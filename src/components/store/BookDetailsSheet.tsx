"use client";

import { BookOpen, CircleCheck, Download, Headphones, Pause, Play } from "lucide-react";
import { BookCover } from "@/components/ui/BookCover";
import { cn, Eyebrow, MetallicButton, ProgressBar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { CATEGORIES, storeItem, type StoreItem } from "@/data/catalog";
import { stopPreview, togglePreview, usePreview } from "@/lib/audio/preview";
import { formatBytes, formatDuration, plural } from "@/lib/format";
import { useStoreActions } from "./useStoreActions";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Оценка ${value} из 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block h-[9px] w-[9px] rotate-45 rounded-[1.5px] bg-track">
            <span className="absolute inset-y-0 left-0 rounded-[1.5px] bg-steel" style={{ width: `${fill * 100}%` }} />
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
  // Audio sample: the item itself, or its narrated companion for e-books.
  const sampleSource = audio ? item : companion?.kind === "audiobook" ? companion : undefined;
  const sampling = preview.itemId === sampleSource?.id;

  const facts: [string, string][] = [
    ["Год", item.year > 1000 ? String(item.year) : `ок. ${item.year} н. э.`],
    ["Формат", item.formatLabel],
    ["Размер", formatBytes(item.fileSize)],
    audio && item.duration ? ["Длительность", formatDuration(item.duration)] : ["Объём", item.pages ? `${item.pages} стр.` : "—"],
    ["Главы", item.chapterCount ? String(item.chapterCount) : "по заголовкам"],
    ["Язык", item.language === "ru" ? "Русский" : "English"],
  ];

  return (
    <div className="mx-auto max-w-[560px] px-6 pb-4">
      <div className="mx-auto mt-3 w-[min(56vw,230px)] [perspective:1000px]">
        <div className="transition-transform duration-500 [transform:rotateY(-14deg)_rotateX(4deg)] hover:[transform:rotateY(0)_rotateX(0)]">
          <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="lg" reflect />
        </div>
      </div>

      <div className="mt-[76px] text-center">
        <Eyebrow>{item.categories.map((c) => CATEGORIES[c]).join(" · ")}</Eyebrow>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em]">{item.title}</h2>
        {item.subtitle && <p className="mt-1 text-[14px] text-ink-2">{item.subtitle}</p>}
        <p className="mt-1 text-[15px] text-ink-2">{item.author}{item.translator ? ` · пер. ${item.translator}` : ""}</p>
        {item.narrator && <p className="mt-1 text-[12.5px] text-ink-3">Читает: {item.narrator}</p>}
        <div className="mt-3 flex items-center justify-center gap-2 text-[13px] text-ink-2 tabular">
          <Stars value={item.rating} />
          <span>{item.rating.toLocaleString("ru-RU")}</span>
          <span className="text-ink-3">· оценка редакции</span>
        </div>
      </div>

      <div className="mt-6 grid gap-2.5">
        {owned ? (
          <MetallicButton size="lg" className="w-full" icon={audio ? <Headphones size={18} /> : <BookOpen size={18} />} onClick={onOpen}>
            {audio ? "Слушать" : "Читать"}
          </MetallicButton>
        ) : job ? (
          <div className="rounded-2xl px-4 py-3.5 metal-card">
            <div className="flex justify-between text-[13px] tabular"><span>{job.stage}</span><span>{Math.round(job.progress * 100)}%</span></div>
            <ProgressBar value={job.progress} className="mt-2" />
          </div>
        ) : (
          <MetallicButton size="lg" className="w-full" icon={<Download size={18} />} onClick={onDownload}>
            Скачать в библиотеку
          </MetallicButton>
        )}
        {sampleSource && (
          <MetallicButton
            variant="secondary"
            size="lg"
            className="w-full"
            icon={sampling && preview.playing ? <Pause size={17} /> : <Play size={17} />}
            onClick={() => togglePreview(sampleSource.id, sampleSource.files[0].url)}
          >
            <span>{sampling && preview.playing ? "Пауза" : "Слушать фрагмент"}</span>
            {sampling && (
              <span className="ml-2 h-[3px] w-16 overflow-hidden rounded-full bg-track">
                <span className="block h-full bg-steel" style={{ width: `${preview.progress * 100}%` }} />
              </span>
            )}
          </MetallicButton>
        )}
        {owned && (
          <p className="flex items-center justify-center gap-1.5 text-[12.5px] text-ink-2">
            <CircleCheck size={14} className="text-steel" /> Сохранено на устройстве · доступно офлайн
          </p>
        )}
      </div>

      {companion && (
        <button type="button" onClick={() => onSelect(companion)} className="mt-6 flex w-full items-center gap-3 rounded-2xl p-3 text-left metal-card">
          <div className="w-12 shrink-0">
            <BookCover url={companion.coverUrl} title={companion.title} square={companion.kind === "audiobook"} sizes="sm" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-medium">{companion.kind === "audiobook" ? "Есть аудиоверсия" : "Есть электронная версия"}</div>
            <div className="text-[12px] text-ink-2">Скачайте обе — и переключайтесь «Читать ↔ Слушать» с того же места.</div>
          </div>
        </button>
      )}

      <p className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-ink">{item.synopsis}</p>

      <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-hairline">
        {facts.map(([k, v]) => (
          <div key={k} className="bg-surface px-3 py-3">
            <dt className="text-[11px] uppercase tracking-[0.1em] text-ink-3">{k}</dt>
            <dd className={cn("mt-1 text-[13.5px] font-medium tabular")}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-center text-[11.5px] text-ink-3">
        Общественное достояние · {item.language === "en" ? "текст Standard Ebooks (CC0)" : "текст из открытого корпуса русской прозы"}
        {audio ? " · озвучено синтезатором речи" : ""}
      </p>
      {item.chapterCount ? <p className="sr-only">{item.chapterCount} {plural(item.chapterCount, "глава", "главы", "глав")}</p> : null}
    </div>
  );
}

"use client";

import { BookOpen, ChevronRight, Download, Headphones, Pause, Play, Star } from "lucide-react";
import type { CSSProperties } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { CoverBackdrop } from "@/components/ui/CoverBackdrop";
import { Button, cn, ProgressBar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { authorOf, categoryName, creditOf, narratorOf, otherTitle, storeItem, synopsisOf, type StoreItem } from "@/data/catalog";
import { stopPreview, togglePreview, usePreview } from "@/lib/audio/preview";
import { useToned } from "@/lib/covers/tone";
import { formatBytes, formatDuration } from "@/lib/format";
import { useStoreActions } from "./useStoreActions";
import { t } from "@/lib/i18n";

/** A store book on a sheet painted in its cover's colour. */
export function BookDetailsSheet({ item, onClose, onSelect }: { item: StoreItem | null; onClose: () => void; onSelect: (i: StoreItem) => void }) {
  const { owned, jobFor, download, open } = useStoreActions();
  const preview = usePreview();
  const { style } = useToned(undefined, item?.coverUrl);
  const close = () => {
    stopPreview();
    onClose();
  };

  return (
    <Sheet
      open={!!item}
      onClose={close}
      full
      widthClass="max-w-[640px] md:max-w-[720px] wide:max-w-[1040px]"
      style={{ ...style, background: "var(--t-solid)" } as CSSProperties}
      handleClassName="bg-t-ink/30"
      backdrop={<CoverBackdrop url={item?.coverUrl} />}
    >
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
    [t("Год"), item.year > 1000 ? String(item.year) : t("ок. {year}", { year: item.year })],
    [t("Формат"), item.formatLabel],
    [t("Размер"), formatBytes(item.fileSize)],
    audio && item.duration ? [t("Длительность"), formatDuration(item.duration)] : [t("Объём"), item.pages ? t("{n} стр.", { n: item.pages }) : "—"],
    [t("Главы"), item.chapterCount ? String(item.chapterCount) : t("по заголовкам")],
    [t("Язык"), item.language === "ru" ? t("русский") : t("английский")],
    ...(narratorOf(item) ? ([[t("Голос"), narratorOf(item)!]] as [string, string][]) : []),
  ];

  return (
    <div className="mx-auto max-w-[560px] px-6 pb-8 text-t-ink wide:grid wide:max-w-none wide:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] wide:gap-10 wide:px-10">
      <div className="wide:sticky wide:top-0 wide:self-start">
        <div className={cn("mx-auto mt-4", audio ? "w-[min(68vw,270px)] sm:w-[300px]" : "w-[min(52vw,210px)] sm:w-[240px]")}>
          <BookCover url={item.coverUrl} title={item.title} author={item.author} square={audio} sizes="lg" shadow={false} className="shadow-[0_26px_50px_-18px_var(--t-shadow)]" />
        </div>

        <div className="mt-8 text-center">
          <h2 className="display text-[30px]">{item.title}</h2>
          {item.subtitle && <p className="mt-1 text-[15px] text-t-ink-2">{item.subtitle}</p>}
          {otherTitle(item) && <p className="mt-1 text-[15px] text-t-ink-2">{t("«{title}»", { title: otherTitle(item)! })}</p>}
          <p className="mt-1.5 text-[17px] font-medium text-t-ink-2">
            {authorOf(item)}
            {item.translator ? `, ${t("пер. {name}", { name: item.translator })}` : ""}
          </p>
          <div className="tabular mt-3 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-t-ink-2">
            <Star size={15} fill="currentColor" strokeWidth={0} />
            <span>{item.rating.toFixed(1).replace(".", ",")}</span>
            <span className="font-medium">· {item.categories.map(categoryName).join(", ")}</span>
          </div>
        </div>
      </div>

      <div>
        <div className="mt-7 grid gap-2 wide:mt-4">
          {owned ? (
            <Button variant="toned" size="lg" className="w-full" icon={audio ? <Headphones size={19} strokeWidth={2} /> : <BookOpen size={19} strokeWidth={2} />} onClick={onOpen}>
              {audio ? t("Слушать") : t("Читать")}
            </Button>
          ) : job ? (
            <div className="rounded-[18px] bg-t-chip px-4 py-3">
              <div className="tabular flex justify-between text-[14px] font-medium"><span>{job.stage}</span><span>{Math.round(job.progress * 100)}%</span></div>
              <ProgressBar toned value={job.progress} className="mt-2" />
            </div>
          ) : (
            <Button variant="toned" size="lg" className="w-full" icon={<Download size={19} strokeWidth={2} />} onClick={onDownload}>
              {t("Скачать в библиотеку")}
            </Button>
          )}
          {sampleSource && (
            <Button
              variant="tonedSoft"
              size="lg"
              className="w-full"
              icon={sampling && preview.playing ? <Pause size={18} strokeWidth={2} /> : <Play size={18} strokeWidth={2} />}
              onClick={() => togglePreview(sampleSource.id, sampleSource.files[0].url)}
            >
              <span>{sampling && preview.playing ? t("Пауза") : t("Слушать фрагмент")}</span>
              {sampling && <ProgressBar toned value={preview.progress} className="ml-2 w-16" />}
            </Button>
          )}
          {owned && <p className="mt-1 text-center text-[13px] text-t-ink-2">{t("Сохранено на устройстве — доступно без интернета")}</p>}
        </div>

        {companion && (
          <button type="button" onClick={() => onSelect(companion)} className="mt-6 flex w-full items-center gap-4 rounded-[20px] bg-t-chip p-3.5 text-left active:opacity-85">
            <div className={companion.kind === "audiobook" ? "w-14 shrink-0" : "w-11 shrink-0"}>
              <BookCover url={companion.coverUrl} title={companion.title} square={companion.kind === "audiobook"} sizes="sm" shadow={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[16px] font-bold">{companion.kind === "audiobook" ? t("Есть аудиоверсия") : t("Есть текст")}</div>
              <div className="text-[14px] leading-snug text-t-ink-2">{t("Скачайте обе — и переключайтесь «Читать / Слушать» с той же главы.")}</div>
            </div>
            <ChevronRight size={20} className="shrink-0 text-t-ink-2" />
          </button>
        )}

        <p className="mt-7 text-[16.5px] leading-[1.6] [text-wrap:pretty]">{synopsisOf(item)}</p>

        <dl className="mt-7 grid grid-cols-2 gap-2">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0 rounded-[16px] bg-t-chip px-3.5 py-2.5">
              <dt className="text-[12.5px] font-medium text-t-ink-2">{k}</dt>
              <dd className="tabular truncate text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[13px] leading-relaxed text-t-ink-2">
          {t("Общественное достояние.")} {item.language === "en" ? t("Текст — Standard Ebooks (CC0).") : t("Текст — открытый корпус русской прозы.")}
          {audio ? ` ${t("Озвучено синтезатором речи RHVoice.")}` : ""}
          {creditOf(item) ? ` ${t("Обложка: {credit}.", { credit: creditOf(item)! })}` : ""}
        </p>
      </div>
    </div>
  );
}

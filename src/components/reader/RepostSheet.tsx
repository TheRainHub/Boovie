"use client";

import { Download, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cn, Segmented, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import type { Tone } from "@/lib/covers/tone";
import { t } from "@/lib/i18n";
import { CARD_SIZES, drawQuote, saveCard, shareCard, type CardFormat, type CardStyle } from "@/lib/reader/quoteImage";

const PREFS_KEY = "boowie-repost";

function savedPrefs(): { style: CardStyle; format: CardFormat } {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as { style?: CardStyle; format?: CardFormat } | null;
    return { style: v?.style ?? "cover", format: v?.format ?? "story" };
  } catch {
    return { style: "cover", format: "story" };
  }
}

const STYLES: { value: CardStyle; label: () => string; swatch: (tone: Tone | null) => string }[] = [
  { value: "cover", label: () => t("Обложка"), swatch: (tone) => (tone && !tone.grey ? `hsl(${tone.h * 360} ${Math.max(34, tone.s * 100)}% 30%)` : "#6B3A22") },
  { value: "paper", label: () => t("Бумага"), swatch: () => "#F6F1E9" },
  { value: "night", label: () => t("Ночь"), swatch: () => "#100D0B" },
  { value: "photo", label: () => t("Книга"), swatch: () => "linear-gradient(135deg,#8a6a4a,#2b1d14)" },
];

/**
 * «Поделиться цитатой»: the passage as a picture, with the book and «Boowie · by MIW Labs» under it — in the look
 * and shape chosen here (remembered on the device), seen before it goes. Saved to the device or handed to the
 * share sheet; the picture is made on the device and kept nowhere else.
 */
export function RepostSheet({ text, book, onClose }: {
  /** The passage; null closes the sheet. */
  text: string | null;
  book: { title: string; author: string; cover?: string; audio?: boolean; tone: Tone | null };
  onClose: () => void;
}) {
  const [{ style, format }, setPrefs] = useState(savedPrefs);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; key: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "share" | null>(null);
  const urlRef = useRef<string | null>(null);
  const key = `${style}|${format}|${text}`;

  const choose = (patch: Partial<{ style: CardStyle; format: CardFormat }>) => {
    const next = { style, format, ...patch };
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };

  // The picture, drawn again for each look and shape.
  useEffect(() => {
    if (text === null) return;
    let alive = true;
    void drawQuote({ text, title: book.title, author: book.author, tone: book.tone, cover: book.cover, audio: book.audio, style, format }).then((blob) => {
      if (!alive) return;
      const url = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setPreview({ url, blob, key: `${style}|${format}|${text}` });
    });
    return () => {
      alive = false;
    };
  }, [text, style, format, book.title, book.author, book.cover, book.audio, book.tone]);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const ready = preview?.key === key ? preview : null;
  const [w, h] = CARD_SIZES[format];

  const act = async (kind: "save" | "share") => {
    if (!ready) return;
    setBusy(kind);
    try {
      const card = { title: book.title, format };
      if (kind === "save") {
        const how = await saveCard(ready.blob, card);
        if (how === "saved") toast(t("Картинка сохранена на устройство"), "success");
      } else {
        await shareCard(ready.blob, card);
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast(t("Не получилось сохранить картинку"), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={text !== null} onClose={onClose} title={t("Поделиться цитатой")}>
      <div className="px-5 pb-4">
        <div className="flex justify-center">
          <div
            className="relative overflow-hidden rounded-[16px] bg-surface-2 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.45)]"
            style={{ height: format === "story" ? "min(46dvh, 420px)" : "min(38dvh, 340px)", aspectRatio: `${w} / ${h}` }}
          >
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element -- a picture made on the device
              <img
                src={preview.url}
                alt={t("Цитата из книги «{title}»", { title: book.title })}
                data-repost-preview={ready ? `${w}x${h}` : undefined}
                className={cn("h-full w-full object-cover transition-opacity", ready ? "opacity-100" : "opacity-60")}
              />
            )}
            {!ready && <span className="absolute inset-0 flex items-center justify-center"><Spinner /></span>}
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-2.5" role="radiogroup" aria-label={t("Оформление")}>
          {STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={style === s.value}
              data-style={s.value}
              disabled={s.value === "photo" && !book.cover}
              onClick={() => choose({ style: s.value })}
              className="flex w-[68px] flex-col items-center gap-1.5 text-[12.5px] font-semibold disabled:opacity-35"
            >
              <span
                className={cn("h-11 w-11 rounded-full ring-1 ring-line", style === s.value && "outline outline-2 outline-offset-2 outline-ink")}
                style={{ background: s.swatch(book.tone) }}
              />
              <span className={style === s.value ? "text-ink" : "text-ink-2"}>{s.label()}</span>
            </button>
          ))}
        </div>

        <Segmented<CardFormat>
          className="mt-4 w-full"
          layoutKey="repost-format"
          value={format}
          onChange={(f) => choose({ format: f })}
          options={[
            { value: "story", label: t("История") },
            { value: "post", label: t("Пост") },
            { value: "square", label: t("Квадрат") },
          ]}
        />

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button size="lg" icon={busy === "save" ? <Spinner size={18} /> : <Download size={18} />} disabled={!ready || !!busy} onClick={() => void act("save")}>
            {t("Сохранить")}
          </Button>
          <Button size="lg" variant="secondary" icon={busy === "share" ? <Spinner size={18} /> : <Share2 size={18} />} disabled={!ready || !!busy} onClick={() => void act("share")}>
            {t("Поделиться")}
          </Button>
        </div>
        <p className="mt-3 text-center text-[12.5px] leading-snug text-ink-2">
          {t("Картинка создаётся на устройстве и никуда не загружается.")}
        </p>
      </div>
    </Sheet>
  );
}

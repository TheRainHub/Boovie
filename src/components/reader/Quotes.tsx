"use client";

import { Copy, Highlighter, Share2, Trash2, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { locale, t } from "@/lib/i18n";
import type { Bookmark } from "@/lib/storage/types";
import type { PaperColors } from "./DictionaryCard";

/**
 * What to do with a passage selected in the text: keep it as a quote (marked in the text, listed with the
 * bookmarks) or share it as a picture. Out of the selection's way, like the dictionary card.
 */
export function QuoteBar({ place, paper, busy, onSave, onShare, onClose }: {
  place: "top" | "bottom";
  paper: PaperColors;
  busy?: boolean;
  onSave: () => void;
  onShare: () => void;
  onClose: () => void;
}) {
  const btn = "flex h-11 items-center gap-2 rounded-full px-4 text-[15px] font-semibold";
  return (
    <div
      className={place === "top" ? "fixed inset-x-0 top-[calc(var(--sat)+10px)] z-[65] flex justify-center px-3" : "fixed inset-x-0 bottom-[calc(var(--sab)+12px)] z-[65] flex justify-center px-3"}
      role="toolbar"
      aria-label={t("Цитата")}
      // Keep the selection: a press on the bar must not clear it.
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 rounded-full p-1 shadow-[0_14px_36px_-14px_rgb(0_0_0/0.5)]" style={{ background: paper.bg, color: paper.ink, border: `1px solid ${paper.rule}` }}>
        <button type="button" className={btn} style={{ background: paper.accent, color: paper.bg }} onClick={onSave}>
          <Highlighter size={18} strokeWidth={2.1} /> {t("Сохранить цитату")}
        </button>
        <button type="button" className={btn} onClick={onShare} disabled={busy} aria-label={t("Поделиться картинкой")}>
          {busy ? <Spinner size={18} /> : <Share2 size={18} strokeWidth={2.1} />} {t("Картинкой")}
        </button>
        <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full" style={{ color: paper.muted }} onClick={onClose} aria-label={t("Закрыть")}>
          <X size={19} />
        </button>
      </div>
    </div>
  );
}

/** A saved quote: its text, and sharing, copying or deleting it. */
export function QuoteSheet({ quote, chapterTitle, busy, onShare, onCopy, onDelete, onClose }: {
  quote: Bookmark | null;
  chapterTitle?: string;
  busy?: boolean;
  onShare: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!quote} onClose={onClose} title={t("Цитата")}>
      {quote?.quote && (
        <div className="px-5 pb-3">
          <blockquote className="max-h-[38vh] overflow-y-auto border-l-[3px] border-accent pl-4 font-serif text-[18px] leading-[1.5]">
            {quote.quote.text}
          </blockquote>
          <div className="mt-2 text-[13px] text-ink-2">
            {[chapterTitle, new Date(quote.createdAt).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" })].filter(Boolean).join(" · ")}
          </div>
          <div className="mt-5 grid gap-2">
            <Button size="lg" className="w-full" icon={busy ? <Spinner size={18} /> : <Share2 size={18} />} onClick={onShare} disabled={busy}>
              {t("Поделиться картинкой")}
            </Button>
            <Button size="lg" variant="secondary" className="w-full" icon={<Copy size={18} />} onClick={onCopy}>
              {t("Скопировать текст")}
            </Button>
            <Button size="lg" variant="ghost" className="w-full text-ink-2" icon={<Trash2 size={18} />} onClick={onDelete}>
              {t("Удалить цитату")}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

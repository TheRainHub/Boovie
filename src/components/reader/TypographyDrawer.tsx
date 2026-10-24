"use client";

import { AlignJustify, AlignLeft, BookOpen, ScrollText } from "lucide-react";
import { cn, Segmented, Slider } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { FONT_LABELS, FONT_STACKS, PAPERS, useReaderPrefs, type Paper, type ReaderFont } from "@/lib/reader/prefs";

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[14px] font-semibold text-ink-2">{label}</span>
        {value && <span className="tabular text-[14px] font-semibold">{value}</span>}
      </div>
      {children}
    </div>
  );
}

export function TypographyDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const p = useReaderPrefs();
  return (
    <Sheet open={open} onClose={onClose} title="Оформление">
      <div className="px-5 pb-2">
        <Row label="Шрифт">
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(Object.keys(FONT_STACKS) as ReaderFont[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => p.set({ font: f })}
                className={cn("flex h-[68px] flex-col items-center justify-center rounded-[16px] text-[13px] font-semibold", p.font === f ? "bg-ink text-bg" : "bg-surface-2 text-ink")}
              >
                <span className="text-[22px] leading-none" style={{ fontFamily: FONT_STACKS[f] }}>Аа</span>
                <span className="mt-1">{FONT_LABELS[f]}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label="Размер" value={`${p.fontSize} pt`}>
          <div className="flex items-center gap-3">
            <span className="text-[14px] font-semibold text-ink-2">А</span>
            <Slider label="Размер шрифта" min={14} max={32} step={1} value={p.fontSize} onChange={(v) => p.set({ fontSize: v })} />
            <span className="text-[22px] font-semibold text-ink-2">А</span>
          </div>
        </Row>
        <Row label="Межстрочный интервал" value={p.lineHeight.toFixed(2)}>
          <Slider label="Межстрочный интервал" min={1.2} max={2.1} step={0.05} value={p.lineHeight} onChange={(v) => p.set({ lineHeight: Math.round(v * 100) / 100 })} />
        </Row>
        <Row label="Поля" value={`${p.margin} px`}>
          <Slider label="Поля страницы" min={8} max={56} step={2} value={p.margin} onChange={(v) => p.set({ margin: v })} />
        </Row>
        <Row label="Фон страницы">
          <div className="mt-1 grid grid-cols-4 gap-2">
            {(Object.keys(PAPERS) as Paper[]).map((k) => {
              const t = PAPERS[k];
              return (
                <button key={k} type="button" onClick={() => p.set({ paper: k })} className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn("flex h-12 w-full items-center justify-center rounded-[14px] border text-[18px] font-semibold", p.paper === k ? "outline outline-2 outline-offset-2 outline-ink" : "")}
                    style={{ background: t.bg, color: t.ink, borderColor: t.rule }}
                  >
                    Аа
                  </span>
                  <span className="text-[13px] font-medium text-ink-2">{t.label}</span>
                </button>
              );
            })}
          </div>
        </Row>
        <div className="grid grid-cols-2 gap-3 py-3">
          <Segmented
            size="sm"
            layoutKey="typo-mode"
            value={p.mode}
            onChange={(mode) => p.set({ mode })}
            options={[
              { value: "paged", label: "Листание", icon: <BookOpen size={13} /> },
              { value: "scroll", label: "Лента", icon: <ScrollText size={13} /> },
            ]}
          />
          <Segmented
            size="sm"
            layoutKey="typo-align"
            value={p.justify ? "j" : "l"}
            onChange={(v) => p.set({ justify: v === "j" })}
            options={[
              { value: "j", label: "По ширине", icon: <AlignJustify size={13} /> },
              { value: "l", label: "Влево", icon: <AlignLeft size={13} /> },
            ]}
          />
        </div>
      </div>
    </Sheet>
  );
}

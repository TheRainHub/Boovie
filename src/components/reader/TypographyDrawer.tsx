"use client";

import { AlignJustify, AlignLeft, BookOpen, ScrollText } from "lucide-react";
import { cn, Eyebrow, MetalSlider, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { FONT_LABELS, FONT_STACKS, PAPERS, useReaderPrefs, type Paper, type ReaderFont } from "@/lib/reader/prefs";

function Row({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="py-3">
      <div className="mb-1 flex items-baseline justify-between">
        <Eyebrow>{label}</Eyebrow>
        {value && <span className="text-[12px] text-ink-2 tabular">{value}</span>}
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
                className={cn("flex h-16 flex-col items-center justify-center rounded-2xl text-[12px]", p.font === f ? "bg-accent text-on-accent" : "metal-card text-ink-2")}
              >
                <span className="text-[22px] leading-none" style={{ fontFamily: FONT_STACKS[f] }}>Аа</span>
                <span className="mt-1">{FONT_LABELS[f]}</span>
              </button>
            ))}
          </div>
        </Row>
        <Row label="Размер" value={`${p.fontSize} pt`}>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-ink-2">А</span>
            <MetalSlider label="Размер шрифта" min={14} max={32} step={1} value={p.fontSize} onChange={(v) => p.set({ fontSize: v })} />
            <span className="text-[20px] text-ink-2">А</span>
          </div>
        </Row>
        <Row label="Межстрочный интервал" value={p.lineHeight.toFixed(2)}>
          <MetalSlider label="Межстрочный интервал" min={1.2} max={2.1} step={0.05} value={p.lineHeight} onChange={(v) => p.set({ lineHeight: Math.round(v * 100) / 100 })} />
        </Row>
        <Row label="Поля" value={`${p.margin} px`}>
          <MetalSlider label="Поля страницы" min={8} max={56} step={2} value={p.margin} onChange={(v) => p.set({ margin: v })} />
        </Row>
        <Row label="Бумага">
          <div className="mt-1 grid grid-cols-4 gap-2">
            {(Object.keys(PAPERS) as Paper[]).map((k) => {
              const t = PAPERS[k];
              return (
                <button key={k} type="button" onClick={() => p.set({ paper: k })} className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn("flex h-12 w-full items-center justify-center rounded-2xl border text-[15px] font-medium", p.paper === k ? "ring-2 ring-steel ring-offset-2 ring-offset-surface" : "")}
                    style={{ background: t.bg, color: t.ink, borderColor: t.rule }}
                  >
                    Аа
                  </span>
                  <span className="text-[11.5px] text-ink-2">{t.label}</span>
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

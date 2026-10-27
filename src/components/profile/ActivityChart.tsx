"use client";

import { useState } from "react";
import { cn } from "@/components/ui/primitives";
import { formatDuration } from "@/lib/format";
import type { Bucket } from "@/lib/stats/summary";

const PLOT_H = 148;
const STEPS_MIN = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 360, 480, 600, 900, 1200, 1800, 2400, 3600];

/** Gridline step (in minutes) giving at most three lines above zero. */
function niceStep(maxSeconds: number): number {
  const maxMin = maxSeconds / 60;
  return STEPS_MIN.find((s) => maxMin / s <= 3) ?? Math.ceil(maxMin / 3 / 60) * 60;
}

const tick = (min: number) => (min < 60 ? `${min} мин` : `${min / 60} ч`);

/**
 * Listening and reading per day (or month) as stacked columns: listening at the base, reading on top, a 2px
 * surface gap between them. Every column is a button; the selected one (today by default) is spelled out above
 * the plot, and the same numbers are available as a table.
 */
export function ActivityChart({ buckets, unit }: { buckets: Bucket[]; unit: "day" | "month" }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(60, ...buckets.map((b) => b.listen + b.read));
  const stepMin = niceStep(max);
  const top = Math.max(stepMin * 60, Math.ceil(max / (stepMin * 60)) * stepMin * 60);
  const lines = Array.from({ length: Math.round(top / (stepMin * 60)) }, (_, i) => (i + 1) * stepMin);
  const shown = buckets[selected ?? buckets.length - 1];
  const dense = buckets.length > 12;
  const empty = buckets.every((b) => b.listen + b.read === 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-medium text-ink-2">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-listen)]" />Слушали</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-[3px] bg-[var(--chart-read)]" />Читали</span>
        <button type="button" className="ml-auto font-semibold text-ink-2 underline-offset-2 hover:underline" onClick={() => setTable((v) => !v)}>
          {table ? "Графиком" : "Таблицей"}
        </button>
      </div>

      {table ? (
        <table className="mt-3 w-full text-[14px]">
          <thead>
            <tr className="text-left text-[12.5px] text-ink-2">
              <th className="py-1.5 font-medium">{unit === "day" ? "День" : "Месяц"}</th>
              <th className="py-1.5 text-right font-medium">Слушали</th>
              <th className="py-1.5 text-right font-medium">Читали</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {[...buckets].reverse().map((b) => (
              <tr key={b.key} className="border-t border-line">
                <td className="py-1.5 first-letter:uppercase">{b.title}</td>
                <td className="py-1.5 text-right">{b.listen ? formatDuration(b.listen) : "—"}</td>
                <td className="py-1.5 text-right">{b.read ? formatDuration(b.read) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <p className="mt-3 min-h-[40px] text-[14px] leading-snug" aria-live="polite">
            <span className="font-semibold first-letter:uppercase">{shown?.today ? (unit === "day" ? "Сегодня" : "Этот месяц") : shown?.title}</span>
            <span className="block text-ink-2">
              {empty ? "Пока пусто — начните читать или слушать" : `Слушали ${formatDuration(shown?.listen ?? 0)} · читали ${formatDuration(shown?.read ?? 0)}`}
            </span>
          </p>
          <div className="relative mt-5 pl-[52px]" style={{ height: PLOT_H + 22 }}>
            {/* Gridlines with their labels; the baseline is the plot's bottom edge. */}
            {lines.map((m) => (
              <div key={m} className="pointer-events-none absolute left-0 right-0 flex items-center gap-2" style={{ bottom: 22 + (m * 60 / top) * PLOT_H - 0.5 }}>
                <span className="tabular w-11 shrink-0 whitespace-nowrap text-right text-[11px] leading-none text-ink-3">{tick(m)}</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            ))}
            <div className="absolute bottom-[22px] left-[52px] right-0 h-px bg-ink/25" />
            <div className="absolute inset-x-0 bottom-0 left-[52px] flex items-stretch" style={{ top: 0 }}>
              {buckets.map((b, i) => {
                const listenH = (b.listen / top) * PLOT_H;
                const readH = (b.read / top) * PLOT_H;
                const active = (selected ?? buckets.length - 1) === i;
                const showLabel = !dense || i === buckets.length - 1 || (buckets.length - 1 - i) % 5 === 0;
                return (
                  <button
                    key={b.key}
                    type="button"
                    className="group relative flex min-w-0 flex-1 flex-col items-center justify-end outline-none"
                    aria-label={`${b.title}: слушали ${formatDuration(b.listen)}, читали ${formatDuration(b.read)}`}
                    aria-pressed={active}
                    onClick={() => setSelected(i)}
                    onMouseEnter={() => setSelected(i)}
                    onFocus={() => setSelected(i)}
                  >
                    <div className={cn("flex w-[min(24px,62%)] flex-col justify-end transition-opacity", !active && selected !== null && "opacity-60")} style={{ height: PLOT_H }}>
                      {readH > 0 && <div className={cn("rounded-t-[4px] bg-[var(--chart-read)]", listenH > 0 && "mb-[2px]")} style={{ height: Math.max(2, readH) }} />}
                      {listenH > 0 && <div className={cn("bg-[var(--chart-listen)]", readH === 0 && "rounded-t-[4px]")} style={{ height: Math.max(2, listenH) }} />}
                    </div>
                    <span className={cn("tabular mt-1.5 h-[16px] text-[11px] leading-[16px]", active ? "font-semibold text-ink" : "text-ink-3", !showLabel && "invisible")}>{b.label}</span>
                    <span className="absolute inset-x-0 bottom-[22px] top-0 rounded-md group-focus-visible:ring-2 group-focus-visible:ring-ink/30" />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

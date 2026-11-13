"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { formatDuration } from "@/lib/format";
import { locale, pl, t } from "@/lib/i18n";
import { dayKey } from "@/lib/stats/activity";
import { level, mapYears, yearMap } from "@/lib/stats/yearMap";
import type { ActivityRecord } from "@/lib/storage/types";

/** Shades of the listening colour over the empty-day colour, light to full. */
const SHADES = ["var(--surface-2)", ...[30, 50, 68, 85, 100].map((p) => `color-mix(in srgb, var(--chart-listen) ${p}%, var(--surface-2))`)];

const dateLabel = (day: string, opts: Intl.DateTimeFormatOptions) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), opts);

/**
 * «Карта чтения»: the year as twelve small month calendars, each day shaded by the time spent with books. A day
 * can be tapped for its numbers and books.
 */
export function YearMap({ rows }: { rows: ActivityRecord[] }) {
  const now = new Date();
  const today = dayKey(now);
  const years = useMemo(() => mapYears(rows, now), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [year, setYear] = useState(now.getFullYear());
  const [picked, setPicked] = useState<string | null>(null);
  const map = useMemo(() => yearMap(rows, year), [rows, year]);
  const at = years.indexOf(year);
  const go = (y: number) => {
    setYear(y);
    setPicked(null);
  };

  const day = picked ? map.days.get(picked) : undefined;
  const dayTotal = day ? day.listen + day.read : 0;

  return (
    <section className="mt-3 rounded-[22px] bg-surface p-4 ring-1 ring-line" aria-label={t("Карта чтения")}>
      <div className="flex items-center gap-2">
        <h2 className="text-[17px] font-bold">{t("Карта чтения")}</h2>
        <div className="ml-auto flex items-center">
          <button type="button" aria-label={t("Предыдущий год")} disabled={at <= 0} onClick={() => go(years[at - 1])} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 active:bg-ink/5 disabled:opacity-30">
            <ChevronLeft size={18} />
          </button>
          <span className="tabular w-12 text-center text-[15px] font-bold">{year}</span>
          <button type="button" aria-label={t("Следующий год")} disabled={at >= years.length - 1} onClick={() => go(years[at + 1])} className="flex h-8 w-8 items-center justify-center rounded-full text-ink-2 active:bg-ink/5 disabled:opacity-30">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-3.5 sm:grid-cols-4 sm:gap-x-5">
        {Array.from({ length: 12 }, (_, m) => (
          <Month key={m} year={year} month={m} today={today} picked={picked} onPick={setPicked} shade={(d) => {
            const x = map.days.get(d);
            return x ? level(x.listen + x.read) : 0;
          }} />
        ))}
      </div>

      <div className="mt-3.5 flex items-center justify-end gap-1.5 text-[12px] font-medium text-ink-3" aria-hidden>
        <span>{t("меньше")}</span>
        {SHADES.map((c) => <i key={c} className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c }} />)}
        <span>{t("больше")}</span>
      </div>

      <div className="mt-2.5 min-h-[44px] border-t border-line pt-2.5 text-[14px] leading-snug" aria-live="polite">
        {picked ? (
          <>
            <div className="font-semibold first-letter:uppercase">
              {dateLabel(picked, { weekday: "long", day: "numeric", month: "long" })}
              {" — "}
              {dayTotal >= 60 ? formatDuration(dayTotal) : t("без книг")}
            </div>
            {day && dayTotal >= 60 && (
              <div className="mt-0.5 text-ink-2">
                {[day.listen >= 60 ? t("слушали {time}", { time: formatDuration(day.listen) }) : null, day.read >= 60 ? t("читали {time}", { time: formatDuration(day.read) }) : null].filter(Boolean).join(" · ")}
                {day.books.length > 0 && <>{": "}{day.books.slice(0, 3).map((b) => b.title).join(", ")}{day.books.length > 3 ? t(" и ещё {n}", { n: day.books.length - 3 }) : ""}</>}
              </div>
            )}
          </>
        ) : map.activeDays ? (
          <div className="text-ink-2">
            <span className="font-semibold text-ink">{t("{n} {days} с книгами", { n: map.activeDays, days: pl(map.activeDays, "день|дня|дней") })}</span>
            {" · "}
            {formatDuration(map.seconds)}
            {map.best && <>{" · "}{t("лучший день — {date}, {time}", { date: dateLabel(map.best.day, { day: "numeric", month: "long" }), time: formatDuration(map.best.seconds) })}</>}
          </div>
        ) : (
          <div className="text-ink-2">{t("В этом году книг пока не было. Каждый день с книгой закрасится на карте.")}</div>
        )}
      </div>
    </section>
  );
}

function Month({ year, month, today, picked, onPick, shade }: {
  year: number;
  month: number;
  today: string;
  picked: string | null;
  onPick: (day: string | null) => void;
  shade: (day: string) => number;
}) {
  const first = new Date(year, month, 1, 12);
  const count = new Date(year, month + 1, 0).getDate();
  // Weeks start on Monday.
  const offset = (first.getDay() + 6) % 7;
  const name = first.toLocaleDateString(locale(), { month: "long" });
  return (
    <div>
      <div className="mb-1 text-[12.5px] font-semibold text-ink-2 first-letter:uppercase">{name}</div>
      <div className="grid grid-cols-7 gap-[2px]">
        {Array.from({ length: offset }, (_, i) => <span key={`o${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const p = (n: number) => String(n).padStart(2, "0");
          const day = `${year}-${p(month + 1)}-${p(i + 1)}`;
          const future = day > today;
          const lv = future ? 0 : shade(day);
          return (
            <button
              key={day}
              type="button"
              disabled={future}
              aria-label={dateLabel(day, { day: "numeric", month: "long" })}
              aria-pressed={picked === day}
              data-day={day}
              data-level={lv}
              onClick={() => onPick(picked === day ? null : day)}
              className={cn(
                "aspect-square rounded-[3px] outline-offset-1",
                future && "opacity-40",
                day === today && "ring-1 ring-ink/50",
                picked === day && "outline-2 outline-ink",
              )}
              style={{ background: SHADES[lv] }}
            />
          );
        })}
      </div>
    </div>
  );
}

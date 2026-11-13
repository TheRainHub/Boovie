"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { cn, ProgressBar } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { locale, t } from "@/lib/i18n";
import { dayKey } from "@/lib/stats/activity";
import { levelName, metalOf, nextTier, towardNext, type AchievementState } from "@/lib/stats/achievements";
import { Badge } from "./Badge";

const dateLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });

/** Earned ones first (the newest first), then the closest to their first level; secrets last. */
function order(list: AchievementState[]): AchievementState[] {
  const rank = (s: AchievementState) => (s.level ? 0 : s.def.secret ? 2 : 1);
  return [...list].sort((a, b) =>
    rank(a) - rank(b) ||
    (a.level && b.level ? (b.earned[b.level - 1] ?? "").localeCompare(a.earned[a.level - 1] ?? "") : towardNext(b) - towardNext(a)),
  );
}

/** «Достижения»: every badge, earned or not, and a sheet with the levels of the one tapped. */
export function Achievements({ list }: { list: AchievementState[] }) {
  const [open, setOpen] = useState<AchievementState | null>(null);
  const sorted = useMemo(() => order(list), [list]);
  const earned = list.filter((s) => s.level > 0).length;
  // Earned in the last three days: marked as new.
  const [fresh] = useState(() => dayKey(new Date(Date.now() - 2 * 86_400_000)));

  return (
    <section className="mt-3 rounded-[22px] bg-surface p-4 ring-1 ring-line" aria-label={t("Достижения")}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[17px] font-bold">{t("Достижения")}</h2>
        <span className="tabular text-[13.5px] font-semibold text-ink-2">{t("{n} из {total}", { n: earned, total: list.length })}</span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 md:grid-cols-5">
        {sorted.map((s) => {
          const hidden = s.def.secret && !s.level;
          const isNew = s.level > 0 && (s.earned[s.level - 1] ?? "") >= fresh;
          return (
            <li key={s.def.id}>
              <button
                type="button"
                data-achievement={s.def.id}
                data-level={s.level}
                onClick={() => setOpen(s)}
                className="flex w-full flex-col items-center rounded-[16px] px-1 py-1 text-center active:bg-ink/5"
              >
                <span className="relative">
                  <Badge icon={s.def.id} metal={metalOf(s.def, s.level)} secret={s.def.secret} progress={s.level ? undefined : towardNext(s)} size={70} />
                  {isNew && <span className="absolute -right-0.5 top-0.5 rounded-full bg-[var(--chart-listen)] px-1.5 py-px text-[10.5px] font-bold text-white">{t("новое")}</span>}
                </span>
                <span className={cn("mt-1 line-clamp-2 text-[13px] font-semibold leading-tight", !s.level && "text-ink-2")}>
                  {hidden ? t("Секрет") : s.def.name()}
                </span>
                {s.def.tiers.length > 1 && (
                  <span className="mt-1 flex gap-[3px]" aria-label={t("Уровень {n} из {total}", { n: s.level, total: s.def.tiers.length })}>
                    {s.def.tiers.map((_, i) => (
                      <i key={i} className={cn("h-1.5 w-1.5 rounded-full", i < s.level ? "bg-[var(--chart-listen)]" : "bg-ink/15")} />
                    ))}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <AchievementSheet state={open} onClose={() => setOpen(null)} />
    </section>
  );
}

function AchievementSheet({ state, onClose }: { state: AchievementState | null; onClose: () => void }) {
  const s = state;
  const hidden = !!s?.def.secret && !s.level;
  const next = s ? nextTier(s) : null;
  return (
    <Sheet open={!!s} onClose={onClose}>
      {s && (
        <div className="px-5 pb-3 pt-2">
          <div className="flex flex-col items-center text-center">
            <Badge icon={s.def.id} metal={metalOf(s.def, s.level)} secret={s.def.secret} progress={s.level ? undefined : towardNext(s)} size={132} />
            <h3 className="display mt-2 text-[26px]">{hidden ? t("Секретное достижение") : s.def.name()}</h3>
            <p className="mt-1 text-[14.5px] font-medium text-ink-2 first-letter:uppercase">
              {hidden
                ? t("Откроется само, когда придёт время")
                : !s.level
                  ? t("Ещё не получено")
                  : s.def.tiers.length > 1
                    ? t("{metal} · уровень {n} из {total}", { metal: levelName(s.def, s.level), n: s.level, total: s.def.tiers.length })
                    : t("Получено {date}", { date: dateLabel(s.earned[0]) })}
            </p>
          </div>

          {!hidden && (
            <ol className="mt-5 space-y-2">
              {s.def.tiers.map((n, i) => {
                const done = i < s.level;
                const current = i === s.level;
                return (
                  <li key={n} className={cn("flex items-center gap-3 rounded-[16px] px-3 py-2.5", current ? "bg-surface-2" : "")}>
                    <Badge icon={s.def.id} metal={done ? metalOf(s.def, i + 1) : 0} size={38} className={done ? "" : "opacity-70"} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[15px] font-semibold leading-snug", !done && !current && "text-ink-2")}>{s.def.goal(n)}</div>
                      {done ? (
                        <div className="text-[13px] text-ink-2 first-letter:uppercase">{s.def.tiers.length > 1 ? `${levelName(s.def, i + 1)} · ` : ""}{dateLabel(s.earned[i])}</div>
                      ) : current && next !== null ? (
                        <div className="mt-1.5 flex items-center gap-2.5">
                          <ProgressBar value={towardNext(s)} className="flex-1" />
                          <span className="tabular shrink-0 text-[12.5px] font-semibold text-ink-2">{t("{now} из {goal}", { now: Math.floor(s.value).toLocaleString(locale()), goal: n.toLocaleString(locale()) })}</span>
                        </div>
                      ) : null}
                    </div>
                    {done && <Check size={18} className="shrink-0 text-[var(--chart-listen)]" strokeWidth={2.6} />}
                  </li>
                );
              })}
            </ol>
          )}
          {!hidden && next === null && s.def.tiers.length > 1 && (
            <p className="mt-3 text-center text-[14px] font-medium text-ink-2">{t("Все уровни пройдены")}</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

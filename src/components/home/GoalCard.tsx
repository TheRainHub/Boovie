"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Target } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { GUEST, useIdentity } from "@/lib/account/identity";
import { locale, pl, t } from "@/lib/i18n";
import { dayKey } from "@/lib/stats/activity";
import { GOAL_CHOICES, goalStreak, secondsOn, setGoal, useGoal, weekOf } from "@/lib/stats/goal";
import { getDB } from "@/lib/storage/db";

/** A ring that fills up with today's minutes. */
function Ring({ value, done, toned, minutes }: { value: number; done: boolean; toned?: boolean; minutes: number }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[58px] w-[58px] shrink-0">
      <svg viewBox="0 0 58 58" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="29" cy="29" r={r} fill="none" strokeWidth="6" className={toned ? "stroke-t-track" : "stroke-track"} />
        {value > 0 && (
          <circle
            cx="29" cy="29" r={r} fill="none" strokeWidth="6" strokeLinecap="round"
            strokeDasharray={`${c * Math.min(1, value)} ${c}`}
            style={{ stroke: toned ? "var(--t-btn, var(--ink))" : "var(--chart-listen)", transition: "stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {done ? <Check size={24} strokeWidth={2.8} /> : <span className="tabular text-[15px] font-extrabold">{minutes}</span>}
      </span>
    </div>
  );
}

/**
 * «Цель на день»: today's minutes with books against the goal, the week's days with the goal reached, and the days
 * in a row. A tap changes the goal. On the home screen (`toned`) it shows only while there is a goal.
 */
export function GoalCard({ toned, className }: { toned?: boolean; className?: string }) {
  const goal = useGoal();
  const owner = useIdentity((s) => s.user?.id ?? GUEST);
  const rows = useLiveQuery(() => getDB().activity.where("owner").equals(owner).toArray(), [owner]);
  const [open, setOpen] = useState(false);
  if (goal === null || !rows || (toned && !goal)) return null;

  const today = secondsOn(rows, dayKey());
  const minutes = Math.floor(today / 60);
  const done = !!goal && today >= goal * 60;
  const streak = goalStreak(rows, goal);
  const week = weekOf(rows);
  const letters = week.map((d) => new Date(`${d.day}T12:00:00`).toLocaleDateString(locale(), { weekday: "narrow" }));

  return (
    <>
      <button
        type="button"
        data-goal={goal}
        onClick={() => setOpen(true)}
        className={cn("flex w-full items-center gap-4 rounded-[22px] p-4 text-left active:scale-[0.99]", toned ? "bg-t-chip text-t-ink" : "bg-surface ring-1 ring-line", className)}
      >
        {goal ? (
          <Ring value={today / (goal * 60)} done={done} toned={toned} minutes={minutes} />
        ) : (
          <span className={cn("flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full", toned ? "bg-t-chip" : "bg-surface-2")}>
            <Target size={24} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-bold">{goal ? (done ? t("Цель на сегодня выполнена") : t("Цель на день")) : t("Поставить цель на день")}</div>
          <div className={cn("text-[13.5px] font-medium", toned ? "text-t-ink-2" : "text-ink-2")}>
            {goal
              ? [t("{n} из {goal} мин", { n: minutes, goal }), streak > 1 ? t("{n} {days} подряд", { n: streak, days: pl(streak, "день|дня|дней") }) : null].filter(Boolean).join(" · ")
              : t("Несколько минут с книгой каждый день")}
          </div>
          {!!goal && (
            <div className="mt-2 flex gap-1.5" aria-label={t("Неделя")}>
              {week.map((d, i) => {
                const met = d.seconds >= goal * 60;
                return (
                  <span key={d.day} className="flex flex-col items-center gap-0.5" title={d.day}>
                    <i
                      data-met={met || undefined}
                      className={cn(
                        "block h-[9px] w-[9px] rounded-full",
                        met ? (toned ? "bg-t-btn" : "bg-[var(--chart-listen)]") : toned ? "bg-t-track" : "bg-track",
                        d.future && "opacity-40",
                        d.today && !met && (toned ? "ring-1 ring-t-ink-2" : "ring-1 ring-ink-3"),
                      )}
                    />
                    <span className={cn("text-[10px] font-semibold uppercase leading-none", toned ? "text-t-ink-2" : "text-ink-3")}>{letters[i]}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <ChevronRight size={20} className={toned ? "text-t-ink-2" : "text-ink-3"} />
      </button>
      <GoalSheet open={open} onClose={() => setOpen(false)} goal={goal} />
    </>
  );
}

function GoalSheet({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: number }) {
  const choose = (m: number) => {
    setGoal(m);
    onClose();
  };
  const tile = "flex h-[60px] flex-col items-center justify-center rounded-[16px] font-semibold";
  return (
    <Sheet open={open} onClose={onClose} title={t("Цель на день")}>
      <div className="px-5 pb-3">
        <p className="text-[14.5px] leading-snug text-ink-2">{t("Сколько минут в день вы хотите проводить с книгами. Считаются и чтение, и прослушивание — со всех ваших устройств.")}</p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {GOAL_CHOICES.map((m) => (
            <button key={m} type="button" aria-pressed={goal === m} onClick={() => choose(m)} className={cn(tile, goal === m ? "bg-ink text-bg" : "bg-surface-2 text-ink")}>
              <span className="tabular text-[20px] leading-none">{m}</span>
              <span className="mt-0.5 text-[12px] opacity-75">{t("мин")}</span>
            </button>
          ))}
        </div>
        <button type="button" aria-pressed={goal === 0} onClick={() => choose(0)} className={cn("mt-2 h-12 w-full rounded-[16px] text-[15px] font-semibold", goal === 0 ? "bg-ink text-bg" : "bg-surface-2 text-ink")}>
          {t("Без цели")}
        </button>
      </div>
    </Sheet>
  );
}

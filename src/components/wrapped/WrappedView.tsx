"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AnimatePresence, motion } from "framer-motion";
import { Share2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { storeItem } from "@/data/catalog";
import { GUEST, useIdentity } from "@/lib/account/identity";
import { withBase } from "@/lib/basePath";
import { useToned } from "@/lib/covers/tone";
import { formatDuration } from "@/lib/format";
import { locale, pl, t } from "@/lib/i18n";
import { useBooks } from "@/lib/library/hooks";
import { bookKey } from "@/lib/stats/activity";
import { shareWrapped } from "@/lib/stats/wrappedImage";
import { wrappedYear, wrapYear, type Persona, type Wrapped, type WrappedBook } from "@/lib/stats/wrapped";
import { getDB } from "@/lib/storage/db";
import type { BookRecord } from "@/lib/storage/types";

const SLIDE_MS = 7000;
const CREAM = "#FFF6EA";

/** Each slide its own colour; the book of the year takes its cover's. */
const THEMES = [
  { bg: "linear-gradient(165deg,#C2582F 0%,#7A2E16 100%)", accent: "#FFD9BC" },
  { bg: "linear-gradient(165deg,#245A44 0%,#0F2A20 100%)", accent: "#BDF2CF" },
  { bg: "linear-gradient(165deg,#22406A 0%,#0E1B2E 100%)", accent: "#B4D6FF" },
  { bg: "linear-gradient(165deg,#C48D2F 0%,#6E4A0E 100%)", accent: "#FFF0C4" },
  { bg: "linear-gradient(165deg,#6A3159 0%,#2E1227 100%)", accent: "#FFCBEE" },
  { bg: "linear-gradient(165deg,#3A322B 0%,#121010 100%)", accent: "#F3E6D3" },
];

type SlideId = "intro" | "time" | "days" | "months" | "topBook" | "top5" | "finished" | "pages" | "author" | "persona" | "summary";

function slidesFor(w: Wrapped): SlideId[] {
  const s: SlideId[] = ["intro"];
  if (w.seconds >= 60) s.push("time");
  if (w.activeDays >= 2) s.push("days");
  if (w.months.filter((m) => m >= 60).length >= 2) s.push("months");
  if (w.books[0]) s.push("topBook");
  if (w.books.length >= 3) s.push("top5");
  if (w.finished.length) s.push("finished");
  if (w.pages >= 20 || w.audioSeconds - w.listenSeconds >= 600) s.push("pages");
  if (w.author) s.push("author");
  s.push("persona", "summary");
  return s;
}

/** Hours as a big number when there are some, minutes otherwise. */
function bigTime(seconds: number): { n: number; unit: string } {
  const h = Math.round(seconds / 3600);
  if (h >= 2) return { n: h, unit: pl(h, "час|часа|часов") };
  const m = Math.max(1, Math.round(seconds / 60));
  return { n: m, unit: pl(m, "минута|минуты|минут") };
}

function monthName(i: number, form: "long" | "short" = "long"): string {
  return new Date(2024, i, 15).toLocaleDateString(locale(), { month: form }).replace(/\.$/, "");
}

function dayName(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(locale(), { day: "numeric", month: "long" });
}

/** A number that counts up when its slide is shown. */
function CountUp({ value, active, className }: { value: number; active: boolean; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1100);
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, active]);
  return <span className={className}>{(active ? shown : value).toLocaleString(locale())}</span>;
}

const rise = (i: number) => ({
  initial: { opacity: 0, y: 26 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.12 + i * 0.14, duration: 0.55, ease: [0.22, 1, 0.36, 1] as const },
});

export function WrappedView() {
  const params = useSearchParams();
  const router = useRouter();
  const year = Number(params.get("year")) || wrappedYear();
  const owner = useIdentity((s) => s.user?.id ?? GUEST);
  const rows = useLiveQuery(() => getDB().activity.where("owner").equals(owner).toArray(), [owner]);
  const books = useBooks();
  const wrapped = useMemo(() => (rows ? wrapYear(rows, year) : null), [rows, year]);
  const local = useMemo(() => new Map((books ?? []).map((b) => [bookKey(b), b])), [books]);

  const close = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/profile/");
  }, [router]);

  if (!wrapped) {
    return <div className="fixed inset-0 z-[90] flex items-center justify-center" style={{ background: THEMES[0].bg, color: CREAM }}><Spinner /></div>;
  }
  if (!wrapped.seconds && !wrapped.finished.length) {
    return (
      <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 px-8 text-center" style={{ background: THEMES[5].bg, color: CREAM }}>
        <p className="display text-[30px]">{t("За {year} год пока нечего подводить", { year })}</p>
        <p className="max-w-[360px] text-[16px] opacity-80">{t("Почитайте или послушайте что-нибудь — итоги соберутся сами.")}</p>
        <button type="button" onClick={close} className="mt-2 rounded-full px-6 py-3 text-[16px] font-semibold" style={{ background: CREAM, color: "#1D1814" }}>{t("Закрыть")}</button>
      </div>
    );
  }
  return <Story wrapped={wrapped} local={local} onClose={close} />;
}

function Story({ wrapped, local, onClose }: { wrapped: Wrapped; local: Map<string, BookRecord>; onClose: () => void }) {
  const slides = useMemo(() => slidesFor(wrapped), [wrapped]);
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const paused = useRef(false);
  const press = useRef<{ at: number; x: number } | null>(null);
  const last = index === slides.length - 1;

  const go = useCallback((to: number) => {
    setIndex(Math.max(0, Math.min(slides.length - 1, to)));
    setProgress(0);
  }, [slides.length]);

  // The slide's time runs while it isn't held; the last one stays.
  useEffect(() => {
    let raf = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = now - prev;
      prev = now;
      if (!paused.current && !last) {
        setProgress((p) => {
          const next = p + dt / SLIDE_MS;
          if (next >= 1) {
            setTimeout(() => go(index + 1), 0);
            return 1;
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, index, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, onClose]);

  const id = slides[index];
  const top = wrapped.books[0];
  const topCover = coverOf(top, local);
  const { style: topTone } = useToned(topCover.fileId, topCover.url, "card");
  const theme = THEMES[index % THEMES.length];
  const background = id === "topBook" ? undefined : theme.bg;

  return (
    <div
      className="fixed inset-0 z-[90] select-none overflow-hidden"
      style={{ background: background ?? "var(--t-bg)", color: id === "topBook" ? "var(--t-ink)" : CREAM, ...(id === "topBook" ? topTone : {}), transition: "background 400ms ease" } as CSSProperties}
      role="dialog"
      aria-label={t("Итоги {year} года", { year: wrapped.year })}
      onPointerDown={(e) => {
        press.current = { at: Date.now(), x: e.clientX };
        paused.current = true;
      }}
      onPointerUp={(e) => {
        paused.current = false;
        const p = press.current;
        press.current = null;
        if (!p || Date.now() - p.at > 350 || (e.target as HTMLElement).closest("button, a")) return;
        if (e.clientX < window.innerWidth * 0.3) go(index - 1);
        else go(index + 1);
      }}
      onPointerCancel={() => {
        paused.current = false;
        press.current = null;
      }}
    >
      {/* Progress, one bar per slide. */}
      <div className="absolute inset-x-0 top-[calc(var(--sat)+10px)] z-10 flex gap-1 px-3" aria-hidden>
        {slides.map((s, i) => (
          <div key={s} className="h-[3px] flex-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.28)" }}>
            <div className="h-full rounded-full" style={{ width: `${i < index ? 100 : i === index ? (last ? 100 : progress * 100) : 0}%`, background: id === "topBook" ? "var(--t-ink)" : CREAM }} />
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-[calc(var(--sat)+20px)] z-10 flex items-center justify-between px-4">
        <span className="text-[13px] font-semibold uppercase tracking-[0.14em] opacity-80">Boowie · {wrapped.year}</span>
        <button type="button" onClick={onClose} aria-label={t("Закрыть итоги")} className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full active:bg-white/10">
          <X size={24} />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={id}
          className="absolute inset-0 flex flex-col justify-center px-7 pb-[calc(var(--sab)+48px)] pt-[calc(var(--sat)+72px)] sm:px-12"
          initial={{ opacity: 0, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.35 }}
          data-slide={id}
        >
          <div className="mx-auto w-full max-w-[520px]">
            <Slide id={id} w={wrapped} local={local} accent={id === "topBook" ? "var(--t-ink-2)" : theme.accent} />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function coverOf(book: WrappedBook | undefined, local: Map<string, BookRecord>): { fileId?: string; url?: string; audio: boolean } {
  if (!book) return { audio: false };
  const b = local.get(book.key);
  const item = book.key.startsWith("store:") ? storeItem(book.key.slice(6)) : undefined;
  const audio = b?.format === "audio" || item?.kind === "audiobook" || book.key.endsWith("|audio") || (book.listen > 0 && book.read === 0);
  return { fileId: b?.coverFileId, url: b?.coverUrl ?? (item ? withBase(item.coverUrl) : undefined), audio };
}

function Cover({ book, local, className }: { book: WrappedBook; local: Map<string, BookRecord>; className?: string }) {
  const c = coverOf(book, local);
  return (
    <div className={className}>
      <BookCover fileId={c.fileId} url={c.url} title={book.title} author={book.author} square={c.audio} sizes="md" />
    </div>
  );
}

function Kicker({ children, color }: { children: ReactNode; color: string }) {
  return <motion.div {...rise(0)} className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color }}>{children}</motion.div>;
}

const PERSONAS: Record<Persona, { title: () => string; text: (w: Wrapped) => string }> = {
  marathoner: { title: () => t("Марафонец"), text: (w) => t("Рекорд — {time} с книгой за один день.", { time: formatDuration(w.bestDay?.seconds ?? 0) }) },
  steady: { title: () => t("Постоянный читатель"), text: (w) => t("{n} {days} подряд — книги стали привычкой.", { n: w.streak.days, days: pl(w.streak.days, "день|дня|дней") }) },
  listener: { title: () => t("Слушатель"), text: (w) => t("{pct}% времени книги звучали в наушниках.", { pct: Math.round((w.listenSeconds / w.seconds) * 100) }) },
  reader: { title: () => t("Книжный червь"), text: (w) => t("{pct}% времени — глазами по строчкам.", { pct: Math.round((w.readSeconds / w.seconds) * 100) }) },
  explorer: { title: () => t("Исследователь"), text: (w) => t("{n} разных книг за год — ты любишь открывать новое.", { n: w.books.length }) },
  allrounder: { title: () => t("Универсал"), text: () => t("Читаешь и слушаешь — как удобнее в моменте.") },
};

function timeComparison(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  if (days >= 1) return t("Это {n} {days} без перерыва", { n: days, days: pl(days, "сутки|суток|суток") });
  const films = Math.floor(seconds / 7200);
  if (films >= 1) return t("Это как {n} {films} подряд", { n: films, films: pl(films, "фильм|фильма|фильмов") });
  const episodes = Math.max(1, Math.floor(seconds / 2700));
  return t("Это как {n} {episodes} сериала", { n: episodes, episodes: pl(episodes, "серия|серии|серий") });
}

function stackHeight(pages: number): { text: string; compare: string } {
  const cm = pages / 100; // a page is about 0.1 mm thick
  const text = cm >= 100 ? t("{n} м", { n: (cm / 100).toLocaleString(locale(), { maximumFractionDigits: 1 }) }) : t("{n} см", { n: Math.max(1, Math.round(cm)) });
  const compare = cm >= 180 ? t("выше человеческого роста") : cm >= 75 ? t("выше обеденного стола") : cm >= 25 ? t("ростом с кошку") : t("с ладонь, и это только начало");
  return { text, compare };
}

function Slide({ id, w, local, accent }: { id: SlideId; w: Wrapped; local: Map<string, BookRecord>; accent: string }) {
  const big = "display text-[clamp(72px,24vw,132px)] leading-[0.9]";
  switch (id) {
    case "intro":
      return (
        <div>
          <Kicker color={accent}>{t("Итоги года")}</Kicker>
          <motion.h1 {...rise(1)} className="display mt-3 text-[clamp(52px,15vw,88px)]">{t("Твой {year} с книгами", { year: w.year })}</motion.h1>
          <motion.p {...rise(2)} className="mt-5 text-[19px] leading-snug opacity-85">{t("Сколько времени ушло на книги, что зацепило больше всего и какой у тебя читательский тип. Листай касанием.")}</motion.p>
        </div>
      );
    case "time": {
      const { n, unit } = bigTime(w.seconds);
      const listen = w.seconds ? w.listenSeconds / w.seconds : 0;
      return (
        <div>
          <Kicker color={accent}>{t("Время с книгами")}</Kicker>
          <motion.div {...rise(1)} className="mt-4"><CountUp value={n} active className={big} /></motion.div>
          <motion.div {...rise(2)} className="display mt-1 text-[34px]">{unit}</motion.div>
          <motion.p {...rise(3)} className="mt-4 text-[19px] opacity-85">{timeComparison(w.seconds)}</motion.p>
          <motion.div {...rise(4)} className="mt-8">
            <div className="flex h-3 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
              <div style={{ width: `${listen * 100}%`, background: accent }} />
            </div>
            <div className="mt-2.5 flex justify-between text-[15px] opacity-90">
              <span>{t("аудио — {time}", { time: formatDuration(w.listenSeconds) })}</span>
              <span>{t("чтение — {time}", { time: formatDuration(w.readSeconds) })}</span>
            </div>
          </motion.div>
        </div>
      );
    }
    case "days":
      return (
        <div>
          <Kicker color={accent}>{t("Дни с книгами")}</Kicker>
          <motion.div {...rise(1)} className="mt-4"><CountUp value={w.activeDays} active className={big} /></motion.div>
          <motion.div {...rise(2)} className="display mt-1 text-[30px]">{t("{days} в году с книгой", { days: pl(w.activeDays, "день|дня|дней") })}</motion.div>
          {w.streak.days >= 2 && (
            <motion.p {...rise(3)} className="mt-6 text-[19px] leading-snug opacity-90">
              {t("Самая длинная серия — {n} {days} подряд, с {from} по {to}.", { n: w.streak.days, days: pl(w.streak.days, "день|дня|дней"), from: dayName(w.streak.from), to: dayName(w.streak.to) })}
            </motion.p>
          )}
          {w.bestDay && (
            <motion.p {...rise(4)} className="mt-3 text-[19px] leading-snug opacity-90">
              {t("Самый книжный день — {day}: {time}.", { day: dayName(w.bestDay.day), time: formatDuration(w.bestDay.seconds) })}
            </motion.p>
          )}
        </div>
      );
    case "months": {
      const max = Math.max(...w.months, 1);
      return (
        <div>
          <Kicker color={accent}>{t("Месяц за месяцем")}</Kicker>
          <motion.h2 {...rise(1)} className="display mt-3 text-[clamp(38px,11vw,60px)]">{t("Самый книжный месяц — {month}", { month: monthName(w.bestMonth) })}</motion.h2>
          <motion.div {...rise(2)} className="mt-8 flex h-[200px] items-end gap-1.5" aria-hidden>
            {w.months.map((m, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <motion.div
                  className="w-full rounded-t-[6px]"
                  style={{ background: i === w.bestMonth ? accent : "rgba(255,255,255,0.32)" }}
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(2, (m / max) * 170)}px` }}
                  transition={{ delay: 0.35 + i * 0.04, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                />
                <span className="text-[11px] opacity-75">{monthName(i, "short").slice(0, 3)}</span>
              </div>
            ))}
          </motion.div>
          <motion.p {...rise(3)} className="mt-6 text-[18px] opacity-85">
            {t("Любимый день недели — {day}.", { day: new Date(2024, 0, 1 + w.bestWeekday).toLocaleDateString(locale(), { weekday: "long" }) })}
          </motion.p>
        </div>
      );
    }
    case "topBook": {
      const b = w.books[0];
      return (
        <div className="text-center">
          <Kicker color={accent}>{t("Книга года")}</Kicker>
          <motion.div initial={{ opacity: 0, scale: 0.85, rotate: -3 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ delay: 0.2, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <Cover book={b} local={local} className="mx-auto mt-6 w-[min(58vw,250px)] drop-shadow-[0_24px_40px_rgba(0,0,0,0.35)]" />
          </motion.div>
          <motion.h2 {...rise(3)} className="display mt-7 text-[clamp(30px,8.5vw,44px)]">{b.title}</motion.h2>
          <motion.p {...rise(4)} className="mt-1 text-[18px] opacity-80">{b.author}</motion.p>
          <motion.p {...rise(5)} className="mt-4 text-[19px] font-semibold">{t("{time} вместе", { time: formatDuration(b.seconds) })}</motion.p>
        </div>
      );
    }
    case "top5":
      return (
        <div>
          <Kicker color={accent}>{t("Больше всего времени")}</Kicker>
          <ol className="mt-5 space-y-3.5">
            {w.books.slice(0, 5).map((b, i) => (
              <motion.li key={b.key} {...rise(i + 1)} className="flex items-center gap-4">
                <span className="display w-7 shrink-0 text-[30px]" style={{ color: accent }}>{i + 1}</span>
                <Cover book={b} local={local} className="w-[52px] shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-bold">{b.title}</div>
                  <div className="truncate text-[15px] opacity-80">{formatDuration(b.seconds)}</div>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      );
    case "finished":
      return (
        <div>
          <Kicker color={accent}>{t("Закончено")}</Kicker>
          <motion.div {...rise(1)} className="mt-4"><CountUp value={w.finished.length} active className={big} /></motion.div>
          <motion.div {...rise(2)} className="display mt-1 text-[30px]">{t("{books} прочитано и дослушано до конца", { books: pl(w.finished.length, "книга|книги|книг") })}</motion.div>
          <motion.div {...rise(3)} className="mt-7 grid grid-cols-5 gap-2.5">
            {w.finished.slice(0, 10).map((b) => <Cover key={b.key} book={b} local={local} />)}
          </motion.div>
        </div>
      );
    case "pages": {
      const saved = w.audioSeconds - w.listenSeconds;
      const stack = stackHeight(w.pages);
      return (
        <div className="space-y-9">
          {w.pages >= 20 && (
            <div>
              <Kicker color={accent}>{t("Страницы")}</Kicker>
              <motion.div {...rise(1)} className="mt-3"><CountUp value={w.pages} active className="display text-[clamp(60px,19vw,104px)] leading-[0.9]" /></motion.div>
              <motion.p {...rise(2)} className="mt-3 text-[19px] leading-snug opacity-90">{t("Стопка высотой {height} — {compare}.", { height: stack.text, compare: stack.compare })}</motion.p>
            </div>
          )}
          {saved >= 600 && (
            <motion.div {...rise(3)}>
              <div className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color: accent }}>{t("Ускорение")}</div>
              <p className="display mt-2 text-[34px]">{t("сэкономило {time}", { time: formatDuration(saved) })}</p>
              <p className="mt-2 text-[17px] opacity-85">{t("{book} аудиокниг уместились в {real}.", { book: formatDuration(w.audioSeconds), real: formatDuration(w.listenSeconds) })}</p>
            </motion.div>
          )}
        </div>
      );
    }
    case "author":
      return (
        <div>
          <Kicker color={accent}>{t("Автор года")}</Kicker>
          <motion.h2 {...rise(1)} className="display mt-4 text-[clamp(44px,13vw,76px)]">{w.author!.name}</motion.h2>
          <motion.p {...rise(2)} className="mt-5 text-[19px] opacity-90">
            {t("{books}, {time} вместе", { books: `${w.author!.books} ${pl(w.author!.books, "книга|книги|книг")}`, time: formatDuration(w.author!.seconds) })}
          </motion.p>
        </div>
      );
    case "persona": {
      const p = PERSONAS[w.persona];
      return (
        <div className="text-center">
          <Kicker color={accent}>{t("Твой читательский тип")}</Kicker>
          <motion.h2 initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.25, duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="display mt-6 text-[clamp(48px,14vw,84px)]">
            {p.title()}
          </motion.h2>
          <motion.p {...rise(3)} className="mx-auto mt-5 max-w-[400px] text-[19px] leading-snug opacity-90">{p.text(w)}</motion.p>
        </div>
      );
    }
    case "summary":
      return <Summary w={w} local={local} accent={accent} />;
  }
}

function Summary({ w, local, accent }: { w: Wrapped; local: Map<string, BookRecord>; accent: string }) {
  const [busy, setBusy] = useState(false);
  const top = w.books[0];
  const rows: [string, string][] = [
    [t("С книгами"), formatDuration(w.seconds)],
    [t("Закончено"), `${w.finished.length} ${pl(w.finished.length, "книга|книги|книг")}`],
    [t("Дней с книгами"), String(w.activeDays)],
    ...(w.pages ? ([[t("Страниц"), w.pages.toLocaleString(locale())]] as [string, string][]) : []),
    ...(w.streak.days >= 2 ? ([[t("Серия"), `${w.streak.days} ${pl(w.streak.days, "день|дня|дней")}`]] as [string, string][]) : []),
  ];
  const share = async () => {
    setBusy(true);
    try {
      const c = coverOf(top, local);
      await shareWrapped(w, { rows, persona: PERSONAS[w.persona].title(), top: top ? { ...c, title: top.title, author: top.author } : null });
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast(t("Не удалось поделиться картинкой"), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Kicker color={accent}>{t("Твой {year}", { year: w.year })}</Kicker>
      <motion.div {...rise(1)} className="mt-5 flex items-center gap-4">
        {top && <Cover book={top} local={local} className="w-[86px] shrink-0" />}
        <div className="min-w-0">
          <div className="text-[13px] font-bold uppercase tracking-[0.1em] opacity-75">{t("Книга года")}</div>
          <div className="display mt-1 text-[24px]">{top?.title}</div>
          <div className="mt-1 text-[15px] opacity-80">{PERSONAS[w.persona].title()}</div>
        </div>
      </motion.div>
      <motion.dl {...rise(2)} className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[14px] opacity-75">{k}</dt>
            <dd className="display text-[26px]">{v}</dd>
          </div>
        ))}
      </motion.dl>
      <motion.button
        {...rise(3)}
        type="button"
        onClick={() => void share()}
        disabled={busy}
        className="mt-9 flex h-14 w-full items-center justify-center gap-2.5 rounded-full text-[17px] font-bold active:scale-[0.98] disabled:opacity-70"
        style={{ background: CREAM, color: "#1D1814" }}
      >
        {busy ? <Spinner size={20} /> : <Share2 size={20} />} {t("Поделиться")}
      </motion.button>
    </div>
  );
}

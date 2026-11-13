"use client";

import { ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/primitives";
import { DictionaryError, lookup, wiktionaryUrl, type DictEntry, type DictResult } from "@/lib/dictionary/lookup";
import { t } from "@/lib/i18n";

export interface PaperColors {
  bg: string;
  ink: string;
  heading: string;
  muted: string;
  rule: string;
  accent: string;
  dark: boolean;
}

/**
 * The meaning of the word selected in the reader (a long press on a phone, a double click on a computer). It
 * stays out of the word's way: at the bottom, or at the top when the word is low on the page.
 */
export function DictionaryCard({ word, place, paper, onClose }: { word: string; place: "top" | "bottom"; paper: PaperColors; onClose: () => void }) {
  const [state, setState] = useState<{ word: string; result?: DictResult | null; error?: string }>({ word });

  useEffect(() => {
    let alive = true;
    lookup(word).then(
      (result) => alive && setState({ word, result }),
      (e) => alive && setState({ word, error: e instanceof DictionaryError ? e.message : "error" }),
    );
    return () => {
      alive = false;
    };
  }, [word]);

  const loading = state.word !== word || (state.result === undefined && !state.error);
  const entries = state.word === word ? state.result?.entries ?? [] : [];
  const sections = useRef<(HTMLElement | null)[]>([]);

  return (
    <div
      className={place === "top" ? "fixed inset-x-0 top-[calc(var(--sat)+8px)] z-[65] flex justify-center px-3" : "fixed inset-x-0 bottom-[calc(var(--sab)+8px)] z-[65] flex justify-center px-3"}
      role="dialog"
      aria-label={t("Словарь: {word}", { word })}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div
        className="flex max-h-[min(58vh,520px)] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] shadow-[0_18px_48px_-16px_rgb(0_0_0/0.45)]"
        style={{ background: paper.bg, color: paper.ink, border: `1px solid ${paper.rule}` }}
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold uppercase tracking-[0.06em]" style={{ color: paper.muted }}>{t("Словарь")}</div>
            {/* Several words fit («thought»: the noun, and the past of «think»): all of them at a glance. */}
            {entries.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label={t("Варианты")}>
                {entries.map((e, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sections.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="rounded-full px-3 py-1 text-[14px]"
                    style={{ border: `1px solid ${paper.rule}`, color: paper.ink }}
                  >
                    <span className="font-semibold">{e.w}</span> <span style={{ color: paper.muted }}>{e.p}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={t("Закрыть словарь")} className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ color: paper.muted }}>
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3" style={{ fontFamily: "var(--reader-font)" }}>
          {loading ? (
            <div className="flex items-center gap-2.5 py-4 text-[15px]" style={{ color: paper.muted }}>
              <Spinner size={18} /> {t("Ищу «{word}»…", { word })}
            </div>
          ) : state.error ? (
            <p className="py-3 text-[15px] leading-snug" style={{ color: paper.muted }}>
              {state.error === "offline"
                ? t("Нет связи. Словарь подгружается по частям: слова, которые вы уже открывали, доступны и без интернета.")
                : state.error === "unsupported"
                  ? t("Для словаря нужна более новая версия системы или браузера.")
                  : t("Словарь сейчас недоступен, попробуйте позже.")}
            </p>
          ) : entries.length === 0 ? (
            <p className="py-3 text-[15px] leading-snug" style={{ color: paper.muted }}>
              {t("Слова «{word}» нет в словаре.", { word })}
            </p>
          ) : (
            entries.map((e, i) => (
              <Entry key={`${e.w}-${e.p}-${i}`} entry={e} word={word} paper={paper} first={i === 0} sectionRef={(el) => { sections.current[i] = el; }} />
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-2.5 text-[12.5px]" style={{ borderColor: paper.rule, color: paper.muted }}>
          <span>{t("Викисловарь · CC BY-SA 4.0")}</span>
          <a href={wiktionaryUrl(entries[0]?.w ?? word)} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold" style={{ color: paper.accent }}>
            {t("Подробнее")} <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}

function Entry({ entry, word, paper, first, sectionRef }: { entry: DictEntry; word: string; paper: PaperColors; first: boolean; sectionRef: (el: HTMLElement | null) => void }) {
  const grammar = [entry.p, entry.g].filter(Boolean).join(", ");
  return (
    <section ref={sectionRef} className={first ? "scroll-mt-2 pt-1" : "mt-4 scroll-mt-2 border-t pt-4"} style={{ borderColor: paper.rule }}>
      {entry.form && <div className="mb-0.5 text-[13.5px]" style={{ color: paper.muted }}>{t("в тексте форма «{word}»", { word })}</div>}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h3 className="text-[23px] font-semibold leading-tight" style={{ color: paper.heading }}>{entry.s ?? entry.w}</h3>
        {entry.i && <span className="text-[15px]" style={{ color: paper.muted }}>{entry.i}</span>}
        {grammar && <span className="text-[14px] italic" style={{ color: paper.muted }}>{grammar}</span>}
      </div>
      <ol className="mt-2 space-y-2.5">
        {entry.m.map((m, i) => (
          <li key={i} className="flex gap-2.5 text-[16.5px] leading-[1.4]">
            {entry.m.length > 1 && <span className="tabular w-4 shrink-0 text-right" style={{ color: paper.muted }}>{i + 1}.</span>}
            <div className="min-w-0">
              {(m.l || m.en) && (
                <span className="mr-1.5 text-[14px] italic" style={{ color: paper.accent }}>{[...(m.l ?? []), ...(m.en ? [t("англ.")] : [])].join(", ")}</span>
              )}
              <span>{m.d}</span>
              {m.h && <span className="ml-1.5 text-[14px] italic" style={{ color: paper.muted }}>({m.h})</span>}
              {m.x && (
                <div className="mt-1 text-[15px] leading-snug" style={{ color: paper.muted }}>
                  <span className="italic">{m.x}</span>
                  {m.t && <span> — {m.t}</span>}
                  {m.r && <span className="whitespace-nowrap"> ({m.r})</span>}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

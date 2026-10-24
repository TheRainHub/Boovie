"use client";

import { AudioLines } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Button, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { ELEVEN_MODELS, getQuota, useElevenPrefs, type ElevenQuota } from "@/lib/integrations/elevenlabs";
import { planVoiceover, runVoiceover, unfinishedVoiceover, type VoiceoverPlan } from "@/lib/integrations/voiceover";
import type { BookRecord } from "@/lib/storage/types";

const nf = new Intl.NumberFormat("ru-RU");

/** «Озвучить»: what it costs (characters, credits, what is left on the account) and one button to start. */
export function VoiceoverSheet({ book, onClose }: { book: BookRecord | null; onClose: () => void }) {
  return (
    <Sheet open={!!book} onClose={onClose} title="Озвучить книгу">
      {book && <Body key={book.id} book={book} onClose={onClose} />}
    </Sheet>
  );
}

function Body({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  const prefs = useElevenPrefs();
  const [plan, setPlan] = useState<VoiceoverPlan | null>(null);
  const [quota, setQuota] = useState<ElevenQuota | null | undefined>(undefined);
  const ready = !!prefs.apiKey && !!prefs.voiceId;
  const earlier = unfinishedVoiceover(book.id);

  useEffect(() => {
    let alive = true;
    void planVoiceover(book.id).then((p) => alive && setPlan(p));
    if (prefs.apiKey) void getQuota(prefs.apiKey).then((q) => alive && setQuota(q)).catch(() => alive && setQuota(null));
    return () => {
      alive = false;
    };
  }, [book.id, prefs.apiKey, prefs.voiceId, prefs.model]);

  const left = quota ? Math.max(0, quota.limit - quota.used) : undefined;
  const short = plan && left !== undefined && plan.credits > left;
  const resuming = plan && plan.remainingChars < plan.totalChars;

  return (
    <div className="px-5 pb-3 pt-1">
      <div className="flex items-end gap-4">
        <div className="w-16 shrink-0"><BookCover fileId={book.coverFileId} url={book.coverUrl} title={book.title} sizes="sm" /></div>
        <div className="min-w-0 pb-0.5">
          <div className="text-[19px] font-extrabold leading-tight tracking-[-0.015em]">{book.title}</div>
          <div className="truncate text-[14px] text-ink-2">{book.author}</div>
        </div>
      </div>

      {!ready ? (
        <div className="mt-5">
          <p className="text-[15px] leading-relaxed text-ink-2">
            Озвучка идёт через ElevenLabs по вашему ключу. Добавьте ключ и выберите голос в настройках — ключ останется только на этом устройстве.
          </p>
          <Link href="/settings/" onClick={onClose}><Button size="lg" className="mt-4 w-full">Открыть настройки</Button></Link>
        </div>
      ) : !plan ? (
        <div className="flex justify-center py-10"><Spinner className="text-ink-2" /></div>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-2">
            {[
              ["Глав", String(plan.chapters.length)],
              [resuming ? "Осталось озвучить" : "Символов", nf.format(plan.remainingChars)],
              ["Голос", prefs.voiceName ?? "—"],
              ["Кредитов", `≈ ${nf.format(plan.credits)}`],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0 rounded-[14px] bg-surface-2 px-3.5 py-2.5">
                <dt className="text-[12px] font-medium text-ink-2">{k}</dt>
                <dd className="tabular truncate text-[15px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[13.5px] leading-snug text-ink-2">
            {ELEVEN_MODELS[prefs.model].hint}.{" "}
            {left !== undefined ? `На счёте ${nf.format(left)} символов.` : ""}{" "}
            {resuming ? "Готовые главы из прошлого раза сохранены — оплачивать их снова не нужно." : earlier ? "Главы, озвученные раньше другим голосом, будут перезаписаны." : ""}
          </p>
          {short && <p className="mt-2 text-[14px] font-semibold text-[#B3261E] dark:text-[#F2B8B5]">Символов на счёте не хватит на всю книгу: озвучка остановится, когда они закончатся, готовые главы сохранятся.</p>}
          <Button
            size="lg"
            className="mt-4 w-full"
            icon={<AudioLines size={19} strokeWidth={2} />}
            onClick={() => {
              onClose();
              void runVoiceover(book.id).then((id) => id && toast(`«${book.title}»: аудиоверсия готова`, "success")).catch((e: Error) => toast(e.message, "error"));
            }}
          >
            {resuming ? "Продолжить озвучку" : "Озвучить"}
          </Button>
          <p className="mt-2 text-center text-[12.5px] text-ink-3">Озвучка идёт, пока приложение открыто. Её можно остановить и продолжить позже.</p>
        </>
      )}
    </div>
  );
}

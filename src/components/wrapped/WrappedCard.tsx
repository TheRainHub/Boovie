"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { GUEST, useIdentity } from "@/lib/account/identity";
import { t } from "@/lib/i18n";
import { hasWrapped, wrappedSeason, wrappedYear } from "@/lib/stats/wrapped";
import { getDB } from "@/lib/storage/db";
import { cn } from "@/components/ui/primitives";

/**
 * The way into «Итоги года»: always in the profile (during the year they grow), and on the home screen in their
 * season, December and January.
 */
export function WrappedCard({ seasonOnly = false, className }: { seasonOnly?: boolean; className?: string }) {
  const owner = useIdentity((s) => s.user?.id ?? GUEST);
  const year = wrappedYear();
  const ready = useLiveQuery(async () => hasWrapped(await getDB().activity.where("owner").equals(owner).toArray(), year), [owner, year]);
  const season = wrappedSeason();
  if (!ready || (seasonOnly && !season)) return null;
  return (
    <Link
      href={`/wrapped/?year=${year}`}
      prefetch={false}
      className={cn("flex items-center gap-4 rounded-[22px] p-4 text-[#FFF6EA] shadow-[0_14px_30px_-16px_rgba(122,46,22,0.7)] active:scale-[0.99]", className)}
      style={{ background: "linear-gradient(135deg,#C2582F 0%,#7A2E16 60%,#6A3159 100%)" }}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15">
        <Sparkles size={24} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[19px] font-extrabold tracking-[-0.01em]">{t("Итоги {year}", { year })}</div>
        <div className="text-[14px] opacity-85">{season ? t("Твой год с книгами: время, любимые книги и читательский тип") : t("Год ещё идёт — итоги пополняются каждый день")}</div>
      </div>
      <ChevronRight size={22} className="shrink-0 opacity-80" />
    </Link>
  );
}

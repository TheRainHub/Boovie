"use client";

import {
  BookAudio, BookCheck, Bookmark, BookOpenText, CalendarCheck, Flame, Footprints, Gauge, Headphones, Hourglass, Landmark,
  Library, PartyPopper, Sofa, Sunrise, Timer, Users, type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import type { AchievementIcon } from "@/lib/stats/achievements";

export const ICONS: Record<AchievementIcon, LucideIcon> = {
  steps: Footprints,
  finished: BookCheck,
  hours: Hourglass,
  streak: Flame,
  marathon: Timer,
  pages: BookOpenText,
  listener: Headphones,
  speed: Gauge,
  both: BookAudio,
  weekend: Sofa,
  classics: Landmark,
  authors: Users,
  days: CalendarCheck,
  collection: Library,
  bookmarks: Bookmark,
  newyear: PartyPopper,
  comeback: Sunrise,
};

/** Metals by level: bronze, silver, gold, emerald, ruby — light edge, dark edge, the inner disc, the icon. */
const METALS: [string, string, string, string][] = [
  ["#E7A774", "#7E4220", "#A65B2B", "#FFF1E4"],
  ["#F4F6F8", "#7D8590", "#A3ABB5", "#2F353D"],
  ["#FFE38F", "#A26C0C", "#CF9628", "#4A2E02"],
  ["#8BDDB8", "#17573F", "#2C8463", "#F0FFF8"],
  ["#F49AA5", "#6A1220", "#A02638", "#FFF0F2"],
];

/** A wavy rosette edge around the centre of a 100 × 100 box. */
const ROSETTE = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 160; i++) {
    const a = (i / 160) * Math.PI * 2;
    const r = 46 - 2.6 * (1 - Math.cos(a * 16)) / 2;
    pts.push(`${(50 + r * Math.sin(a)).toFixed(2)} ${(50 - r * Math.cos(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
})();

/**
 * An achievement's badge: a metal rosette with the achievement's sign. `metal` 0 is a badge not earned yet (in
 * the interface's own colours, with the way to its first level as a ring); `secret` hides the sign.
 */
export function Badge({ icon, metal, size = 64, secret, progress, className }: {
  icon: AchievementIcon;
  metal: number;
  size?: number;
  secret?: boolean;
  /** 0..1 toward the first level, drawn on a locked badge. */
  progress?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const Icon = ICONS[icon];
  const m = metal > 0 ? METALS[Math.min(metal, METALS.length) - 1] : null;
  const ring = 2 * Math.PI * 38;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      {m && (
        <defs>
          <linearGradient id={`e${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={m[0]} />
            <stop offset="1" stopColor={m[1]} />
          </linearGradient>
          <linearGradient id={`d${id}`} x1="0.85" y1="1" x2="0.15" y2="0">
            <stop offset="0" stopColor={m[0]} stopOpacity="0.9" />
            <stop offset="0.55" stopColor={m[2]} />
            <stop offset="1" stopColor={m[1]} />
          </linearGradient>
        </defs>
      )}
      {/* A locked badge in the interface's own colours, a shade off the card in either theme. */}
      <path d={ROSETTE} style={{ fill: m ? `url(#e${id})` : "color-mix(in srgb, var(--ink) 10%, var(--surface))" }} />
      <circle
        cx="50" cy="50" r="33" strokeWidth="1.6"
        style={{ fill: m ? `url(#d${id})` : "var(--surface)", stroke: m ? "rgb(255 255 255 / 0.45)" : "color-mix(in srgb, var(--ink) 16%, var(--surface))" }}
      />
      {m && <ellipse cx="50" cy="31" rx="21" ry="9" fill="white" opacity="0.16" />}
      {!m && progress !== undefined && progress > 0 && (
        <circle
          cx="50" cy="50" r="38" fill="none" stroke="var(--chart-listen)" strokeWidth="3.2" strokeLinecap="round"
          strokeDasharray={`${ring * Math.min(1, progress)} ${ring}`} transform="rotate(-90 50 50)"
        />
      )}
      {secret && !m ? (
        <text x="50" y="62" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--ink-3)">?</text>
      ) : (
        <Icon x={31} y={31} width={38} height={38} strokeWidth={2.1} color={m ? m[3] : "var(--ink-3)"} />
      )}
    </svg>
  );
}

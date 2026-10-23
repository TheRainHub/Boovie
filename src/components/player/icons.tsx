/** Precision skip glyphs: circular arrow with the interval engraved inside. */
export function SkipGlyph({ seconds, direction, size = 28 }: { seconds: number; direction: "back" | "forward"; size?: number }) {
  const flip = direction === "back";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <g transform={flip ? "translate(32 0) scale(-1 1)" : undefined}>
        <path d="M25.5 16a9.5 9.5 0 1 1-3.1-7.03" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        <path d="M23.4 4.6v4.9h-4.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x="16" y="19.6" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="currentColor" style={{ fontFamily: "var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
        {seconds}
      </text>
    </svg>
  );
}

export function PlayGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10.2-6.4c.6-.4.6-1.3 0-1.7L9.6 4.8C8.9 4.3 8 4.8 8 5.6Z" fill="currentColor" />
    </svg>
  );
}

export function PauseGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" />
    </svg>
  );
}

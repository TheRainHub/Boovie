"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { forwardRef, useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

export const cn = clsx;

/* ── Buttons ────────────────────────────────────────────────────────────────────────────
   Pills. `toned` / `tonedSoft` sit on cover-tinted surfaces (the colours come from <Toned> vars). */
type Variant = "primary" | "secondary" | "ghost" | "toned" | "tonedSoft";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-bg active:opacity-85",
  secondary: "bg-surface-2 text-ink active:opacity-80",
  ghost: "text-ink hover:bg-ink/5 active:bg-ink/10",
  toned: "bg-t-btn text-t-btn-ink active:opacity-85",
  tonedSoft: "bg-t-chip text-t-ink active:opacity-80",
};
const sizeClasses: Record<Size, string> = {
  sm: "h-9 px-4 text-[14px] gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-[52px] px-6 text-[16px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold transition-[background,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});

type IconVariant = "ghost" | "soft" | "primary" | "toned" | "tonedSoft" | "tonedGhost";
const iconVariant: Record<IconVariant, string> = {
  ghost: "text-ink hover:bg-ink/5 active:bg-ink/10",
  soft: "bg-surface-2 text-ink active:opacity-80",
  primary: "bg-ink text-bg active:opacity-85",
  toned: "bg-t-btn text-t-btn-ink active:opacity-85",
  tonedSoft: "bg-t-chip text-t-ink active:opacity-80",
  tonedGhost: "text-t-ink active:bg-t-chip",
};

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; variant?: IconVariant }>(
  function IconButton({ label, size = 40, variant = "ghost", className, children, type = "button", style, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        style={{ width: size, height: size, ...style }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full transition-[background,opacity,transform] duration-150 active:scale-[0.96] disabled:opacity-30",
          iconVariant[variant],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

/* ── Slider ───────────────────────────────────────────────────────────────────────────── */
export function Slider({
  value, min = 0, max = 1, step = "any", onChange, onCommit, label, className, disabled,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number | "any";
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      aria-label={label}
      className={cn("range", className)}
      style={{ "--fill": `${pct}%` } as CSSProperties}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
      onKeyUp={(e) => onCommit?.(Number((e.target as HTMLInputElement).value))}
    />
  );
}

/* ── Segmented control: a pill track with a sliding pill ─────────────────────────────── */
export function Segmented<T extends string>({
  options, value, onChange, className, size = "md", layoutKey, toned,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  layoutKey?: string;
  /** On a cover-tinted surface. */
  toned?: boolean;
}) {
  const autoId = useId();
  const id = layoutKey ?? autoId;
  return (
    <div role="tablist" className={cn("relative inline-flex rounded-full p-[3px]", toned ? "bg-t-chip" : "bg-surface-2", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={active}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative z-0 inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold transition-colors duration-200 disabled:opacity-35",
              size === "sm" ? "h-8 px-3.5 text-[13px]" : "h-9 px-4 text-[14px]",
              active ? (toned ? "text-t-btn-ink" : "text-ink") : toned ? "text-t-ink-2" : "text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
                className={cn("absolute inset-0 -z-10 rounded-full", toned ? "bg-t-btn" : "bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-ink/15")}
              />
            )}
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Chips: filters and secondary tabs ───────────────────────────────────────────────── */
export function Chip({ active, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[14px] font-semibold transition-colors duration-150",
        active ? "bg-ink text-bg" : "bg-surface-2 text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function ChipTabs<T extends string>({
  options, value, onChange, className, label,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("no-scrollbar flex gap-1.5 overflow-x-auto", className)}>
      {options.map((o) => (
        <Chip key={o.value} role="tab" aria-selected={o.value === value} active={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="tabular opacity-60">{o.count}</span>}
        </Chip>
      ))}
    </div>
  );
}

/* ── Progress ─────────────────────────────────────────────────────────────────────────── */
export function ProgressBar({ value, className, color, toned }: { value: number; className?: string; color?: string; toned?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full", toned ? "bg-t-track" : "bg-track", className)} aria-hidden>
      <div className={cn("h-full rounded-full transition-[width] duration-300", toned ? "bg-t-btn" : "bg-accent")} style={{ width: `${v * 100}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.2" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** Section title with an optional action on the right («Все 6»). */
export function SectionTitle({ title, action, className, as: Tag = "h2" }: { title: ReactNode; action?: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <Tag className="display text-[21px]">{title}</Tag>
      {action !== undefined && <span className="shrink-0 text-[14px] font-semibold text-ink-2">{action}</span>}
    </div>
  );
}

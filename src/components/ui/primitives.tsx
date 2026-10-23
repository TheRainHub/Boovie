"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { forwardRef, useId, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

export const cn = clsx;

/* ── GlassPanel ─────────────────────────────────────────────────────────────────────────
   visionOS-style frosted glass. Light: silver glass with a specular white edge.
   Dark: graphite glass with a 1px inner top highlight. */
export const glassClasses =
  "bg-[#F4F6F9]/75 backdrop-blur-2xl border border-white/80 shadow-[0_4px_24px_rgba(15,23,42,0.06)] " +
  "dark:bg-[#161920]/75 dark:border-white/[0.08] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]";

export const GlassPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { as?: "div" | "nav" | "header" | "footer" | "section" }>(
  function GlassPanel({ className, as: Tag = "div", ...props }, ref) {
    return <Tag ref={ref} className={cn(glassClasses, "backdrop-saturate-150", className)} {...props} />;
  },
);

/* ── MetallicButton ─────────────────────────────────────────────────────────────────────
   primary: dark gunmetal (light theme) / polished chrome (dark theme). */
type Variant = "primary" | "secondary" | "ghost" | "glass";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "text-on-accent bg-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(15,17,21,0.25)] " +
    "bg-[linear-gradient(180deg,#2B3038_0%,#1E2229_55%,#181B21_100%)] " +
    "dark:bg-[linear-gradient(180deg,#F7F8FA_0%,#E2E6ED_50%,#C9CFD8_100%)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(0,0,0,0.5)] " +
    "active:brightness-95",
  secondary: "metal-card text-ink active:brightness-[0.97]",
  ghost: "text-ink hover:bg-hairline active:bg-hairline",
  glass: cn(glassClasses, "text-ink"),
};
const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-full",
  md: "h-11 px-5 text-[15px] gap-2 rounded-full",
  lg: "h-13 px-6 text-[16px] gap-2.5 rounded-2xl",
};

export interface MetallicButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const MetallicButton = forwardRef<HTMLButtonElement, MetallicButtonProps>(function MetallicButton(
  { variant = "primary", size = "md", icon, className, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-[filter,transform,opacity] duration-150 ease-[var(--ease-machined)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
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

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: number; variant?: "ghost" | "glass" | "secondary" | "primary"; active?: boolean }>(
  function IconButton({ label, size = 40, variant = "ghost", active, className, children, type = "button", style, ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        style={{ width: size, height: size, ...style }}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full transition-[background,transform,color] duration-150 active:scale-[0.94] disabled:opacity-35",
          variant === "ghost" && "text-ink hover:bg-hairline",
          variant === "glass" && cn(glassClasses, "text-ink"),
          variant === "secondary" && "metal-card text-ink",
          variant === "primary" && variantClasses.primary,
          active && "text-steel",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

/* ── MetalSlider ────────────────────────────────────────────────────────────────────────
   Native range input (accessible, works with VoiceOver/TalkBack) styled as a machined slider. */
export function MetalSlider({
  value, min = 0, max = 1, step = "any", onChange, onCommit, label, small, className, disabled,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number | "any";
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  small?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  const pct = max > min ? ((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range"
      aria-label={label}
      className={cn("metal-range", small && "metal-range-sm", className)}
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

/* ── Segmented control (machined toggle with sliding indicator) ─────────────────────── */
export function Segmented<T extends string>({
  options, value, onChange, className, size = "md", layoutKey,
}: {
  options: { value: T; label: ReactNode; disabled?: boolean; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  layoutKey?: string;
}) {
  const autoId = useId();
  const id = layoutKey ?? autoId;
  return (
    <div
      role="tablist"
      className={cn(
        "relative inline-flex rounded-full bg-surface-2 p-[3px] shadow-[inset_0_1px_2px_rgba(15,17,21,0.08)] dark:shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
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
              "relative z-0 inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors duration-200 disabled:opacity-40",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-9 px-4 text-[14px]",
              active ? "text-ink" : "text-ink-2",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 -z-10 rounded-full metal-card"
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

/* ── Chip ─────────────────────────────────────────────────────────────────────────────── */
export function Chip({ active, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-[background,color,box-shadow] duration-150",
        active
          ? "bg-accent text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]"
          : "metal-card text-ink-2 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Progress bar (thin machined track) ──────────────────────────────────────────────── */
export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-[3px] w-full overflow-hidden rounded-full bg-track", className)}>
      <div className="h-full rounded-full bg-steel transition-[width] duration-300" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("animate-spin text-ink-2", className)} aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Small uppercase label used for section headers. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3", className)}>{children}</div>;
}

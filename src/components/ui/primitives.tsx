"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { forwardRef, useId, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

export const cn = clsx;

/* ── GlassPanel ─────────────────────────────────────────────────────────────────────────
   Frosted glass for the chrome that floats over content (dock, mini player, sheets, reader bars). */
export const glassClasses =
  "bg-[#F4F6F9]/75 backdrop-blur-2xl border border-white/80 shadow-[0_4px_24px_rgba(15,23,42,0.06)] " +
  "dark:bg-[#161920]/75 dark:border-white/[0.08] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)]";

export const GlassPanel = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { as?: "div" | "nav" | "header" | "footer" | "section" }>(
  function GlassPanel({ className, as: Tag = "div", ...props }, ref) {
    return <Tag ref={ref} className={cn(glassClasses, "backdrop-saturate-150", className)} {...props} />;
  },
);

/* ── Buttons ────────────────────────────────────────────────────────────────────────────
   Flat, machined keys: gunmetal (light theme) / polished chrome (dark theme), 4 px corners. */
type Variant = "primary" | "secondary" | "ghost" | "glass";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] active:opacity-85",
  secondary: "border border-ink/20 text-ink hover:border-ink/45 active:bg-ink/5 dark:border-ink/25",
  ghost: "text-ink hover:bg-ink/5 active:bg-ink/10",
  glass: cn(glassClasses, "text-ink"),
};
const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-11 px-4 text-[14.5px] gap-2",
  lg: "h-[52px] px-5 text-[15.5px] gap-2.5",
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
        "inline-flex select-none items-center justify-center rounded-[4px] font-medium transition-[background,border-color,opacity,transform] duration-150 ease-[var(--ease-machined)] active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
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
          "inline-flex shrink-0 items-center justify-center rounded-[4px] transition-[background,color,transform] duration-150 active:translate-y-px disabled:opacity-30",
          variant === "ghost" && "text-ink hover:bg-ink/5",
          variant === "glass" && cn(glassClasses, "text-ink"),
          variant === "secondary" && "border border-ink/20 text-ink",
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

/* ── Ruler slider ─────────────────────────────────────────────────────────────────────── */
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

/* ── Hardware toggle (Читать | Слушать) ─────────────────────────────────────────────────
   Ruled segments in a 1 px frame; the active segment is a solid key that slides between positions. */
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
    <div role="tablist" className={cn("relative inline-flex rounded-[4px] border border-ink/25 p-[2px]", className)}>
      {options.map((o, i) => {
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
              "relative z-0 inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] font-medium transition-colors duration-200 disabled:opacity-35",
              size === "sm" ? "h-7 px-3 text-[12.5px]" : "h-8 px-4 text-[13.5px]",
              active ? "text-on-accent" : "text-ink-2 hover:text-ink",
              i > 0 && !active && options[i - 1]?.value !== value && "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-px before:bg-ink/15",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 520, damping: 42 }}
                className="absolute inset-0 -z-10 rounded-[2px] bg-accent"
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

/* ── Underline tabs with counters ─────────────────────────────────────────────────────── */
export function Tabs<T extends string>({
  options, value, onChange, className, layoutKey,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  layoutKey: string;
}) {
  return (
    <nav className={cn("no-scrollbar flex gap-6 overflow-x-auto border-b border-hairline", className)} role="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn("relative flex shrink-0 items-baseline gap-1 whitespace-nowrap pb-2.5 pt-1 text-[14.5px] transition-colors", active ? "text-ink" : "text-ink-3 hover:text-ink-2")}
          >
            {o.label}
            {o.count !== undefined && <span className="num text-[10.5px] text-ink-3">{o.count}</span>}
            {active && <motion.span layoutId={`tabs-${layoutKey}`} className="absolute inset-x-0 -bottom-px h-[2px] bg-ink" transition={{ type: "spring", stiffness: 520, damping: 42 }} />}
          </button>
        );
      })}
    </nav>
  );
}

/* ── Tag (category filter) ───────────────────────────────────────────────────────────── */
export function Chip({ active, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-[3px] border px-3 text-[13px] transition-colors duration-150",
        active ? "border-accent bg-accent text-on-accent" : "border-ink/15 text-ink-2 hover:border-ink/35 hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ── Graduated progress (ruler) ──────────────────────────────────────────────────────── */
export function ProgressBar({ value, className, ticks = true }: { value: number; className?: string; ticks?: boolean }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("relative h-[7px] w-full", className)} aria-hidden>
      {ticks && <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,var(--ink-3)_0_1px,transparent_1px_10%)] opacity-45 [mask:linear-gradient(transparent_0_2px,#000_2px_5px,transparent_5px)]" />}
      <div className="absolute inset-x-0 top-[3px] h-px bg-track" />
      <div className="absolute left-0 top-[2.5px] h-[2px] bg-steel transition-[width] duration-300" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cn("animate-spin text-ink-2", className)} aria-hidden>
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="1.5" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}

/** Small sentence-case caption. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[12px] text-ink-3", className)}>{children}</div>;
}

/** Section head: italic serif title, a rule running to the edge, an optional mono readout. */
export function SectionHead({ title, meta, className, as: Tag = "h2" }: { title: ReactNode; meta?: ReactNode; className?: string; as?: "h2" | "h3" }) {
  return (
    <div className={cn("flex items-baseline gap-3", className)}>
      <Tag className="font-display text-[21px] italic leading-none">{title}</Tag>
      <span className="h-px flex-1 translate-y-[-4px] bg-hairline" />
      {meta !== undefined && <span className="num text-[11px] text-ink-3">{meta}</span>}
    </div>
  );
}

/** Catalogue number: 001, 002… */
export function CatNo({ n, className }: { n: number; className?: string }) {
  return <span className={cn("num text-[10.5px] text-ink-3", className)}>{String(n).padStart(3, "0")}</span>;
}

export type { HTMLAttributes };

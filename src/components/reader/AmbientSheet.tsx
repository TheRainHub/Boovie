"use client";

import { AudioWaveform, CloudLightning, CloudRain, Flame, Moon, Trees, TrainFront, VolumeX, Waves, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn, IconButton, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { activeSounds, attachAmbient, setAmbientLevel, stopAmbient, toggleAmbient, unlockAmbient, useAmbient, type AmbientId } from "@/lib/audio/ambient";
import { t } from "@/lib/i18n";

export const SOUNDS: { id: AmbientId; icon: LucideIcon; name: () => string }[] = [
  { id: "rain", icon: CloudRain, name: () => t("Дождь") },
  { id: "storm", icon: CloudLightning, name: () => t("Гроза") },
  { id: "fire", icon: Flame, name: () => t("Камин") },
  { id: "sea", icon: Waves, name: () => t("Море") },
  { id: "forest", icon: Trees, name: () => t("Лес") },
  { id: "night", icon: Moon, name: () => t("Ночь") },
  { id: "train", icon: TrainFront, name: () => t("Поезд") },
];

/** For a reader: the remembered sounds come back at the first touch and stop when the book is closed. */
export function useAmbientInBook() {
  useEffect(() => attachAmbient(), []);
}

/** The reader's bar button: the playing sound's sign (or a wave for several), in the accent colour. */
export function AmbientButton({ onClick }: { onClick: () => void }) {
  const { levels, playing } = useAmbient();
  const on = playing ? activeSounds(levels) : [];
  const Icon = (on.length === 1 && SOUNDS.find((s) => s.id === on[0])?.icon) || AudioWaveform;
  return (
    <IconButton label={t("Звуки для чтения")} onClick={onClick} className={on.length ? "text-accent" : undefined}>
      <Icon size={19} />
    </IconButton>
  );
}

const PILL_H = 150;

/**
 * A level as a tall pill, the way the phone's own volume looks: it fills from the bottom. Dragging up or down
 * changes the level from where it was (not from where the finger lands); a tap switches the sound on or off.
 * Arrow keys change it too.
 */
function LevelPill({ label, icon: Icon, value, loading, onChange, onToggle }: {
  label: string;
  icon: LucideIcon;
  value: number;
  loading: boolean;
  onChange: (v: number) => void;
  onToggle: () => void;
}) {
  const drag = useRef<{ y: number; v: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const on = value > 0;

  const down = (e: PointerEvent<HTMLDivElement>) => {
    unlockAmbient();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value, moved: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 5) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    onChange(Math.round(Math.max(0, Math.min(1, d.v + dy / PILL_H)) * 100) / 100);
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && !d.moved) onToggle();
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      unlockAmbient();
      onChange(Math.round(Math.max(0, Math.min(1, value + step)) * 100) / 100);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      unlockAmbient();
      onToggle();
    }
  };

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={on ? `${Math.round(value * 100)}%` : t("выключено")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className={cn(
          "ambient-pill relative mx-auto w-full max-w-[78px] cursor-grab touch-none select-none overflow-hidden rounded-[26px] outline-offset-2 transition-transform duration-150",
          dragging && "scale-[1.04] cursor-grabbing",
        )}
        style={{ height: PILL_H }}
      >
        <span
          className="ambient-fill absolute inset-x-0 bottom-0"
          style={{ height: `${value * 100}%`, transition: dragging ? "none" : "height 220ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        <span className={cn("absolute inset-x-0 bottom-[18px] flex justify-center", value >= 0.2 ? "ambient-icon-on" : "ambient-icon-off")}>
          {loading ? <Spinner size={24} /> : <Icon size={26} strokeWidth={2.1} />}
        </span>
        {dragging && <span className="tabular absolute inset-x-0 top-3 text-center text-[13px] font-bold text-white/85 mix-blend-difference">{Math.round(value * 100)}</span>}
      </div>
      <span aria-hidden className={cn("text-[13px] font-semibold", on ? "text-ink" : "text-ink-2")}>{label}</span>
    </div>
  );
}

/** «Звуки для чтения»: every sound with a level of its own, so they can be mixed; and silence for all. */
export function AmbientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { levels, loading } = useAmbient();
  const anyOn = activeSounds(levels).length > 0;
  return (
    <Sheet open={open} onClose={onClose} title={t("Звуки для чтения")}>
      <div className="px-5 pb-3">
        <div className="grid grid-cols-4 gap-x-3 gap-y-4">
          {SOUNDS.map((s) => (
            <LevelPill
              key={s.id}
              label={s.name()}
              icon={s.icon}
              value={levels[s.id] ?? 0}
              loading={loading.includes(s.id)}
              onChange={(v) => setAmbientLevel(s.id, v)}
              onToggle={() => toggleAmbient(s.id)}
            />
          ))}
          <div className="flex w-full flex-col items-center gap-1.5">
            <button
              type="button"
              aria-label={t("Тишина")}
              aria-pressed={!anyOn}
              onClick={stopAmbient}
              className={cn("ambient-pill mx-auto flex w-full max-w-[78px] items-end justify-center rounded-[26px] pb-[18px]", anyOn ? "ambient-icon-off" : "ambient-silence-on")}
              style={{ height: PILL_H }}
            >
              <VolumeX size={26} strokeWidth={2.1} />
            </button>
            <span aria-hidden className={cn("text-[13px] font-semibold", anyOn ? "text-ink-2" : "text-ink")}>{t("Тишина")}</span>
          </div>
        </div>
        <p className="mt-4 text-[13.5px] leading-snug text-ink-2">
          {t("Звуки можно смешивать: у каждого своя громкость — потяните вверх или вниз, нажмите, чтобы включить или выключить. Они создаются прямо на устройстве, работают без интернета и играют, пока открыта книга.")}
        </p>
      </div>
    </Sheet>
  );
}

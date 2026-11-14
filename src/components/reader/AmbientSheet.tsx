"use client";

import { AudioWaveform, CloudLightning, CloudRain, Flame, Moon, Trees, TrainFront, Waves, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn, IconButton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { activeSounds, attachAmbient, prepareAmbient, setAmbientLevel, setLevelLive, unlockAudio, useAmbient, type AmbientId } from "@/lib/audio/ambient";
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

/** For a reader: every book starts in silence, and closing it stops the sounds. */
export function useAmbientInBook() {
  useEffect(() => attachAmbient(), []);
}

/** The reader's bar button: the playing sound's sign (or a wave for several), in the accent colour. */
export function AmbientButton({ onClick }: { onClick: () => void }) {
  const levels = useAmbient((s) => s.levels);
  const on = activeSounds(levels);
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
 * changes the level from where it was (not from where the finger lands); arrow keys change it too. During a drag
 * only this pill and the sound's gain change, once per frame.
 */
function LevelPill({ id, label, icon: Icon, value }: { id: AmbientId; label: string; icon: LucideIcon; value: number }) {
  const drag = useRef<{ y: number; v: number; moved: boolean; frame: number; next: number } | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const level = shown ?? value;
  const dragging = shown !== null;

  const down = (e: PointerEvent<HTMLDivElement>) => {
    unlockAudio();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, v: value, moved: false, frame: 0, next: value };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = d.y - e.clientY;
    if (!d.moved && Math.abs(dy) < 3) return;
    d.moved = true;
    d.next = Math.round(Math.max(0, Math.min(1, d.v + dy / PILL_H)) * 100) / 100;
    // One update a frame, however often the finger reports.
    if (!d.frame) {
      d.frame = requestAnimationFrame(() => {
        d.frame = 0;
        setShown(d.next);
        setLevelLive(id, d.next);
      });
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.frame) cancelAnimationFrame(d.frame);
    if (d.moved) setAmbientLevel(id, d.next);
    setShown(null);
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2, Home: -1, End: 1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    unlockAudio();
    setAmbientLevel(id, Math.round(Math.max(0, Math.min(1, value + step)) * 100) / 100);
  };

  return (
    <div className="flex w-[calc(25%-9px)] flex-col items-center gap-1.5">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        aria-valuetext={level > 0 ? `${Math.round(level * 100)}%` : t("выключено")}
        data-sound={id}
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
        <span className="ambient-fill absolute inset-x-0 bottom-0" style={{ height: `${level * 100}%`, transition: dragging ? "none" : "height 200ms cubic-bezier(0.22,1,0.36,1)" }} />
        <span className={cn("absolute inset-x-0 bottom-[18px] flex justify-center", level >= 0.2 ? "ambient-icon-on" : "ambient-icon-off")}>
          <Icon size={26} strokeWidth={2.1} />
        </span>
        {dragging && <span className="tabular absolute inset-x-0 top-3 text-center text-[13px] font-bold text-white/85 mix-blend-difference">{Math.round(level * 100)}</span>}
      </div>
      <span aria-hidden className={cn("text-[13px] font-semibold", level > 0 ? "text-ink" : "text-ink-2")}>{label}</span>
    </div>
  );
}

/** «Звуки для чтения»: every sound with a level of its own, so they can be mixed. */
export function AmbientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const levels = useAmbient((s) => s.levels);
  // The sounds are made while the sheet opens, so a slider brings its sound in at once.
  useEffect(() => {
    if (open) prepareAmbient();
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={t("Звуки для чтения")}>
      <div className="px-5 pb-3">
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-4">
          {SOUNDS.map((s) => (
            <LevelPill key={s.id} id={s.id} label={s.name()} icon={s.icon} value={levels[s.id] ?? 0} />
          ))}
        </div>
        <p className="mt-4 text-[13.5px] leading-snug text-ink-2">
          {t("Потяните звук вверх, чтобы добавить его, и вниз, чтобы убрать; звуки можно смешивать. Они создаются прямо на устройстве, работают без интернета и играют, пока открыта книга.")}
        </p>
      </div>
    </Sheet>
  );
}

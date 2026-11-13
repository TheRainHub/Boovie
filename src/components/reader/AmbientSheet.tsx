"use client";

import { AudioWaveform, CloudLightning, CloudRain, Flame, Moon, Trees, TrainFront, Volume1, Volume2, VolumeX, Waves, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import { cn, IconButton, Slider, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { attachAmbient, playAmbient, setAmbientVolume, stopAmbient, useAmbient, type AmbientId } from "@/lib/audio/ambient";
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

/** For a reader: the remembered sound comes back at the first touch and stops when the book is closed. */
export function useAmbientInBook() {
  useEffect(() => attachAmbient(), []);
}

/** The reader's bar button: the playing sound's sign, in the accent colour. */
export function AmbientButton({ onClick }: { onClick: () => void }) {
  const { id, playing } = useAmbient();
  const Icon = (playing && SOUNDS.find((s) => s.id === id)?.icon) || AudioWaveform;
  return (
    <IconButton label={t("Звуки для чтения")} onClick={onClick} className={playing ? "text-accent" : undefined}>
      <Icon size={19} />
    </IconButton>
  );
}

/** «Звуки для чтения»: silence or one of the sounds, and its volume. */
export function AmbientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { id, volume, loading, playing } = useAmbient();
  const tile = "relative flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-[16px] text-[13px] font-semibold transition-colors";
  return (
    <Sheet open={open} onClose={onClose} title={t("Звуки для чтения")}>
      <div className="px-5 pb-3">
        <div className="grid grid-cols-4 gap-2">
          <button type="button" aria-pressed={!playing && !loading} onClick={stopAmbient} className={cn(tile, !playing && !loading ? "bg-ink text-bg" : "bg-surface-2 text-ink")}>
            <VolumeX size={22} strokeWidth={1.9} />
            {t("Тишина")}
          </button>
          {SOUNDS.map((s) => {
            const on = (playing || !!loading) && id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                data-sound={s.id}
                aria-pressed={on}
                onClick={() => (on && !loading ? stopAmbient() : void playAmbient(s.id))}
                className={cn(tile, on ? "bg-ink text-bg" : "bg-surface-2 text-ink")}
              >
                {loading === s.id ? <Spinner size={22} /> : <s.icon size={22} strokeWidth={1.9} />}
                {s.name()}
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-3">
          <Volume1 size={20} className="shrink-0 text-ink-2" />
          <Slider label={t("Громкость звуков")} min={0.05} max={1} step={0.01} value={volume} onChange={setAmbientVolume} />
          <Volume2 size={20} className="shrink-0 text-ink-2" />
        </div>
        <p className="mt-4 text-[13.5px] leading-snug text-ink-2">
          {t("Звуки создаются прямо на устройстве и работают без интернета. Они играют, пока открыта книга, и вернутся в следующий раз.")}
        </p>
      </div>
    </Sheet>
  );
}

"use client";

import { Check, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, cn, Segmented, Spinner } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { ELEVEN_MODELS, getQuota, listVoices, useElevenPrefs, type ElevenModel, type ElevenQuota, type ElevenVoice } from "@/lib/integrations/elevenlabs";

const nf = new Intl.NumberFormat("ru-RU");

/** Settings block: API key (kept on the device), voice with previews, model, characters left this month. */
export function ElevenLabsSettings() {
  const prefs = useElevenPrefs();
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<{ loading: boolean; voices?: ElevenVoice[]; quota?: ElevenQuota | null; error?: string }>({ loading: false });
  const [picking, setPicking] = useState(false);
  const connected = !!prefs.apiKey;

  const connect = async (key: string) => {
    setState({ loading: true });
    try {
      const [voices, quota] = await Promise.all([listVoices(key), getQuota(key)]);
      prefs.set({ apiKey: key });
      if (!prefs.voiceId || !voices.some((v) => v.voice_id === prefs.voiceId)) {
        const first = voices[0];
        if (first) prefs.set({ voiceId: first.voice_id, voiceName: first.name });
      }
      setState({ loading: false, voices, quota });
      setDraft("");
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  };

  // Refresh voices and quota for a saved key.
  useEffect(() => {
    if (!prefs.apiKey) return;
    let alive = true;
    void Promise.all([listVoices(prefs.apiKey), getQuota(prefs.apiKey)])
      .then(([voices, quota]) => alive && setState({ loading: false, voices, quota }))
      .catch((e: Error) => alive && setState({ loading: false, error: e.message }));
    return () => {
      alive = false;
    };
  }, [prefs.apiKey]);

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold">ElevenLabs</div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">
            Озвучивает ваши электронные книги живым голосом. Ключ хранится только на этом устройстве: elevenlabs.io → Developers → API Keys.
          </div>
        </div>
        {connected && <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-2"><Check size={15} /> Подключено</span>}
      </div>

      {!connected ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) void connect(draft.trim());
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="API-ключ ElevenLabs"
            aria-label="API-ключ ElevenLabs"
            className="h-11 min-w-0 flex-1 rounded-[14px] bg-surface-2 px-3.5 text-[15px] font-medium outline-none placeholder:text-ink-3"
          />
          <Button type="submit" disabled={!draft.trim() || state.loading}>{state.loading ? <Spinner size={18} /> : "Подключить"}</Button>
        </form>
      ) : (
        <div className="mt-3 grid gap-2.5">
          <button type="button" onClick={() => setPicking(true)} className="flex items-center justify-between gap-3 rounded-[14px] bg-surface-2 px-3.5 py-3 text-left">
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-ink-2">Голос</span>
              <span className="block truncate text-[15.5px] font-semibold">{prefs.voiceName ?? "Выберите голос"}</span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold text-ink-2">Изменить</span>
          </button>
          <Segmented<ElevenModel>
            className="w-full"
            layoutKey="eleven-model"
            value={prefs.model}
            onChange={(model) => prefs.set({ model })}
            options={(Object.keys(ELEVEN_MODELS) as ElevenModel[]).map((m) => ({ value: m, label: ELEVEN_MODELS[m].label }))}
          />
          <p className="text-[13px] leading-snug text-ink-2">{ELEVEN_MODELS[prefs.model].hint}.</p>
          {state.quota && (
            <p className="tabular text-[13.5px] font-medium">
              Осталось {nf.format(Math.max(0, state.quota.limit - state.quota.used))} из {nf.format(state.quota.limit)} символов в этом месяце
            </p>
          )}
          <Button variant="ghost" size="sm" className="justify-self-start text-ink-2" onClick={() => { prefs.set({ apiKey: "", voiceId: undefined, voiceName: undefined }); setState({ loading: false }); toast("Ключ ElevenLabs удалён с устройства"); }}>
            Отключить
          </Button>
        </div>
      )}
      {state.error && <p className="mt-2 text-[13.5px] font-medium text-[#B3261E] dark:text-[#F2B8B5]">{state.error}</p>}
      <VoicePicker open={picking} onClose={() => setPicking(false)} voices={state.voices} />
    </div>
  );
}

function VoicePicker({ open, onClose, voices }: { open: boolean; onClose: () => void; voices?: ElevenVoice[] }) {
  const prefs = useElevenPrefs();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = () => {
    audio.current?.pause();
    setPlaying(null);
  };
  const preview = (v: ElevenVoice) => {
    if (!v.preview_url) return;
    if (playing === v.voice_id) return stop();
    audio.current?.pause();
    audio.current = new Audio(v.preview_url);
    audio.current.onended = () => setPlaying(null);
    void audio.current.play().then(() => setPlaying(v.voice_id)).catch(() => setPlaying(null));
  };
  return (
    <Sheet open={open} onClose={() => { stop(); onClose(); }} title="Голос">
      {!voices ? (
        <div className="flex justify-center py-10"><Spinner className="text-ink-2" /></div>
      ) : (
        <ul className="px-3 pb-4">
          {voices.map((v) => {
            const on = v.voice_id === prefs.voiceId;
            const labels = Object.values(v.labels ?? {}).filter(Boolean).slice(0, 3).join(" · ");
            return (
              <li key={v.voice_id} className={cn("flex items-center gap-3 rounded-[14px] px-3 py-2.5", on && "bg-surface-2")}>
                <button type="button" aria-label={`Прослушать: ${v.name}`} disabled={!v.preview_url} onClick={() => preview(v)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40">
                  {playing === v.voice_id ? <Pause size={17} /> : <Play size={17} />}
                </button>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { prefs.set({ voiceId: v.voice_id, voiceName: v.name }); stop(); onClose(); }}>
                  <span className={cn("block truncate text-[16px]", on ? "font-bold" : "font-medium")}>{v.name}</span>
                  {labels && <span className="block truncate text-[13px] text-ink-2">{labels}</span>}
                </button>
                {on && <Check size={18} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

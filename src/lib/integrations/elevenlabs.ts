"use client";

/**
 * ElevenLabs text-to-speech with the user's own API key. The key never leaves the device except in requests to
 * api.elevenlabs.io (the site is static and public, so it cannot hold a shared key).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { t } from "../i18n";

export const ELEVEN_API = "https://api.elevenlabs.io";

export type ElevenModel = "eleven_multilingual_v2" | "eleven_flash_v2_5";

export const ELEVEN_MODELS: Record<ElevenModel, { label: string; hint: string; creditsPerChar: number }> = {
  eleven_multilingual_v2: { get label() { return t("Качество"); }, get hint() { return t("Multilingual v2 — самый естественный русский"); }, creditsPerChar: 1 },
  eleven_flash_v2_5: { get label() { return t("Дешевле"); }, get hint() { return t("Flash v2.5 — вдвое меньше кредитов, чуть проще интонации"); }, creditsPerChar: 0.5 },
};

interface ElevenPrefs {
  apiKey: string;
  voiceId?: string;
  voiceName?: string;
  model: ElevenModel;
  set: (patch: Partial<Omit<ElevenPrefs, "set">>) => void;
}

export const useElevenPrefs = create<ElevenPrefs>()(
  persist((set) => ({ apiKey: "", model: "eleven_multilingual_v2", set: (patch) => set(patch) }), { name: "boowie-elevenlabs", version: 1 }),
);

export class ElevenError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function call(path: string, key: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(ELEVEN_API + path, { ...init, headers: { "xi-api-key": key, ...(init.headers ?? {}) } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ElevenError(t("Не удалось связаться с ElevenLabs. Проверьте интернет — или браузер не разрешил запрос с этого сайта."));
  }
  if (res.ok) return res;
  let detail = "";
  try {
    const j = (await res.json()) as { detail?: string | { message?: string; status?: string } };
    detail = typeof j.detail === "string" ? j.detail : j.detail?.message ?? j.detail?.status ?? "";
  } catch {
    /* not JSON */
  }
  if (res.status === 401) throw new ElevenError(t("ElevenLabs не принял ключ. Проверьте его в настройках."), 401);
  if (res.status === 402 || /quota|credits/i.test(detail)) throw new ElevenError(t("На счёте ElevenLabs не хватает символов."), res.status);
  if (res.status === 429) throw new ElevenError(t("ElevenLabs просит подождать: слишком много запросов подряд."), 429);
  throw new ElevenError(`ElevenLabs: ${detail || t("ошибка {status}", { status: res.status })}`, res.status);
}

export interface ElevenVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

export async function listVoices(key: string): Promise<ElevenVoice[]> {
  const j = (await (await call("/v1/voices", key)).json()) as { voices?: ElevenVoice[] };
  return j.voices ?? [];
}

export interface ElevenQuota {
  used: number;
  limit: number;
  tier?: string;
  resetsAt?: number;
}

/** Characters used / available this billing period (keys without the user scope get `null`). */
export async function getQuota(key: string): Promise<ElevenQuota | null> {
  try {
    const j = (await (await call("/v1/user/subscription", key)).json()) as {
      character_count: number;
      character_limit: number;
      tier?: string;
      next_character_count_reset_unix?: number;
    };
    return { used: j.character_count, limit: j.character_limit, tier: j.tier, resetsAt: j.next_character_count_reset_unix ? j.next_character_count_reset_unix * 1000 : undefined };
  } catch (e) {
    if (e instanceof ElevenError && e.status === 401) throw e;
    return null;
  }
}

/** One request: MP3 (44.1 kHz, 128 kbit/s). Neighbouring text keeps the intonation continuous across pieces. */
export async function synthesize(
  key: string,
  voiceId: string,
  model: ElevenModel,
  text: string,
  context: { previous?: string; next?: string } = {},
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const res = await call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, key, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model, previous_text: context.previous || undefined, next_text: context.next || undefined }),
    signal,
  });
  return new Uint8Array(await res.arrayBuffer());
}

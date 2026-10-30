"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { normalizeServerUrl, testConnection, useLibrarr } from "@/lib/integrations/librarr";
import { t } from "@/lib/i18n";

/** Settings block: the Librarr server address (HTTPS) and its API key. */
export function LibrarrSettings() {
  const lib = useLibrarr();
  const [url, setUrl] = useState(lib.url);
  const [key, setKey] = useState("");
  const [state, setState] = useState<{ loading: boolean; error?: string; ok?: string }>({ loading: false });
  const connected = !!lib.url;

  const connect = async () => {
    setState({ loading: true });
    try {
      const base = normalizeServerUrl(url);
      const res = await testConnection(base, key.trim());
      lib.set({ url: base, apiKey: key.trim() });
      setKey("");
      setState({ loading: false, ok: res.total !== undefined ? t("В библиотеке {n}", { n: res.total }) : t("Подключено") });
      toast(t("Librarr подключён — книги в «Магазине»"), "success");
    } catch (e) {
      setState({ loading: false, error: (e as Error).message });
    }
  };

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[16px] font-semibold">Librarr</div>
          <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">
            {t("Ваша библиотека с сервера Librarr появится в «Магазине»: любую книгу можно скачать в Boowie. Нужен адрес по HTTPS и API_KEY сервера.")}
          </div>
        </div>
        {connected && <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-2"><Check size={15} /> {t("Подключено")}</span>}
      </div>
      {!connected ? (
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) void connect();
          }}
        >
          <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoComplete="off" spellCheck={false} placeholder="https://librarr.example.com" aria-label={t("Адрес Librarr")} className="h-11 rounded-[14px] bg-surface-2 px-3.5 text-[15px] font-medium outline-none placeholder:text-ink-3" />
          <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" spellCheck={false} placeholder={t("API-ключ (если включена авторизация)")} aria-label={t("API-ключ Librarr")} className="h-11 rounded-[14px] bg-surface-2 px-3.5 text-[15px] font-medium outline-none placeholder:text-ink-3" />
          <Button type="submit" className="justify-self-start" disabled={!url.trim() || state.loading}>{state.loading ? <Spinner size={18} /> : t("Подключить")}</Button>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-[14.5px] font-medium">{lib.url}</span>
          <Button variant="ghost" size="sm" className="text-ink-2" onClick={() => { lib.set({ url: "", apiKey: "" }); setUrl(""); setState({ loading: false }); }}>
            {t("Отключить")}
          </Button>
        </div>
      )}
      {state.ok && <p className="mt-2 text-[13.5px] font-medium text-ink-2">{state.ok}</p>}
      {state.error && <p className="mt-2 text-[13.5px] font-medium text-[#B3261E] dark:text-[#F2B8B5]">{state.error}</p>}
    </div>
  );
}

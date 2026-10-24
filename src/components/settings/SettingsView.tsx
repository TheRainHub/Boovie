"use client";

import { useEffect, useState } from "react";
import { cn, MetallicButton, ProgressBar, SectionHead, Segmented } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { closePlayer } from "@/lib/audio/player";
import { useCoverPrefs } from "@/lib/covers/auto";
import { formatBytes } from "@/lib/format";
import { useBooks } from "@/lib/library/hooks";
import { deleteBook } from "@/lib/library/repository";
import { requestPersistentStorage, storageEstimate } from "@/lib/storage/blobStore";
import { useTheme, type ThemePreference } from "@/lib/theme";

function Row({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-hairline py-3.5", className)}>
      <div className="min-w-0">
        <div className="text-[14.5px]">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug text-ink-3">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn("relative h-7 w-12 rounded-[3px] border transition-colors", on ? "border-accent bg-accent" : "border-ink/25 bg-transparent")}
    >
      <span className={cn("absolute top-[3px] h-5 w-5 rounded-[2px] transition-all duration-200", on ? "left-[24px] bg-on-accent" : "left-[3px] bg-ink/40")} />
    </button>
  );
}

export function SettingsView() {
  const theme = useTheme();
  const books = useBooks();
  const covers = useCoverPrefs();
  const [estimate, setEstimate] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    void storageEstimate().then((e) => alive && setEstimate(e));
    return () => {
      alive = false;
    };
  }, [books?.length]);

  const libraryBytes = (books ?? []).reduce((s, b) => s + b.fileSize, 0);

  return (
    <main className="mx-auto max-w-[640px] px-5 pt-[calc(var(--sat)+22px)]">
      <header className="border-b border-rule pb-3">
        <h1 className="font-display text-[46px] leading-[0.9]">Настройки</h1>
      </header>

      <section className="mt-8">
        <SectionHead title="Оформление" />
        <Row label="Тема" hint="Серебро — светлая, Графит — тёмная">
          <Segmented<ThemePreference>
            size="sm"
            layoutKey="theme"
            value={theme.preference}
            onChange={(p) => theme.setPreference(p)}
            options={[
              { value: "system", label: "Авто" },
              { value: "light", label: "Серебро" },
              { value: "dark", label: "Графит" },
            ]}
          />
        </Row>
        <Row label="Искать обложки в интернете" hint="Для книг без обложки — по названию: Apple Books, Google Books, Open Library">
          <Switch on={covers.online} onChange={covers.set} label="Искать обложки в интернете" />
        </Row>
      </section>

      <section className="mt-9">
        <SectionHead title="Хранилище" meta={formatBytes(libraryBytes)} />
        {estimate && estimate.quota > 0 && (
          <div className="border-b border-hairline py-3.5">
            <div className="num flex justify-between text-[10.5px] text-ink-2">
              <span>занято {formatBytes(estimate.usage)}</span>
              <span>доступно {formatBytes(estimate.quota)}</span>
            </div>
            <ProgressBar value={estimate.usage / estimate.quota} className="mt-2" />
          </div>
        )}
        <Row
          label="Постоянное хранилище"
          hint={estimate?.persisted ? "Включено — система не удалит книги." : "Без него браузер может очистить данные при нехватке места."}
        >
          {estimate?.persisted ? (
            <span className="num text-[11px] text-steel">ВКЛ.</span>
          ) : (
            <MetallicButton
              size="sm"
              variant="secondary"
              onClick={async () => {
                const ok = await requestPersistentStorage();
                setEstimate(await storageEstimate());
                toast(ok ? "Хранилище закреплено" : "Браузер отклонил запрос — установите приложение на экран «Домой»", ok ? "success" : "info");
              }}
            >
              Закрепить
            </MetallicButton>
          )}
        </Row>
        {(books?.length ?? 0) > 0 && (
          <Row label="Очистить библиотеку" hint="Удалит все книги и прогресс с этого устройства">
            {!confirm ? (
              <MetallicButton variant="secondary" size="sm" onClick={() => setConfirm(true)}>Удалить…</MetallicButton>
            ) : (
              <MetallicButton
                size="sm"
                onClick={async () => {
                  closePlayer();
                  for (const b of books ?? []) await deleteBook(b.id);
                  setConfirm(false);
                  toast("Библиотека очищена");
                }}
              >
                Удалить {books?.length}
              </MetallicButton>
            )}
          </Row>
        )}
      </section>

      <section className="mt-9">
        <SectionHead title="Установка" />
        <ol className="mt-1">
          {[
            ["iPhone", "Safari → «Поделиться» → «На экран „Домой“». Приложение откроется без панели браузера."],
            ["Android", "Chrome → меню → «Установить приложение»."],
            ["Папки", "На iPhone папку с аудиокнигой можно «Сжать» в «Файлах» и загрузить получившийся ZIP."],
          ].map(([k, v], i) => (
            <li key={k} className="flex gap-4 border-b border-hairline py-3.5">
              <span className="num w-5 shrink-0 pt-0.5 text-[10.5px] text-ink-3">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <div className="text-[14.5px]">{k}</div>
                <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{v}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-6 mt-9">
        <SectionHead title="О каталоге" />
        <p className="mt-3 font-display text-[16px] leading-[1.55] text-ink-2">
          Все книги магазина — общественное достояние. Русская классика взята из открытого корпуса RussianNovels,
          английские издания — из Standard Ebooks (CC0). Аудиокниги озвучены синтезатором речи RHVoice.
        </p>
      </section>
    </main>
  );
}

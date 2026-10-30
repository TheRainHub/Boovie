"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ElevenLabsSettings } from "@/components/integrations/ElevenLabsSettings";
import { LibrarrSettings } from "@/components/integrations/LibrarrSettings";
import { Button, cn, IconButton, ProgressBar, Segmented } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { closePlayer } from "@/lib/audio/player";
import { useCoverPrefs } from "@/lib/covers/auto";
import { formatBytes } from "@/lib/format";
import { setLang, t, useLang, type Lang } from "@/lib/i18n";
import { useBooks } from "@/lib/library/hooks";
import { deleteBook } from "@/lib/library/repository";
import { requestPersistentStorage, storageEstimate } from "@/lib/storage/blobStore";
import { useTheme, type ThemePreference } from "@/lib/theme";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="px-1 text-[14px] font-semibold text-ink-2">{title}</h2>
      <div className="mt-2 overflow-hidden rounded-[20px] bg-surface ring-1 ring-line">{children}</div>
    </section>
  );
}

function Row({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-4 border-b border-line px-4 py-3.5 last:border-b-0", className)}>
      <div className="min-w-0">
        <div className="text-[16px] font-semibold">{label}</div>
        {hint && <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{hint}</div>}
      </div>
      {children !== undefined && <div className="shrink-0">{children}</div>}
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
      className={cn("relative h-[31px] w-[51px] rounded-full transition-colors duration-200", on ? "bg-accent" : "bg-surface-2")}
    >
      <span className={cn("absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-all duration-200", on ? "left-[22px]" : "left-[2px]")} />
    </button>
  );
}

export function SettingsView() {
  const router = useRouter();
  const theme = useTheme();
  const lang = useLang();
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
    <main className="mx-auto max-w-[640px] px-5 pb-8 pt-[calc(var(--sat)+10px)]">
      <header className="flex items-center gap-1">
        <IconButton label={t("Назад")} className="-ml-2" onClick={() => (window.history.length > 1 ? router.back() : router.push("/library/"))}>
          <ChevronLeft size={26} strokeWidth={2} />
        </IconButton>
        <h1 className="display text-[30px]">{t("Настройки")}</h1>
      </header>

      <Group title={t("Оформление")}>
        <div className="border-b border-line px-4 py-3.5">
          {/* Each language is named in itself, so either can be found whatever the interface speaks. */}
          <div className="text-[16px] font-semibold">Язык · Language</div>{/* i18n-ignore: both names, so the switch can be found in either language */}
          <Segmented<Lang>
            className="mt-2.5 w-full"
            layoutKey="lang"
            value={lang}
            onChange={setLang}
            options={[
              { value: "ru", label: "Русский" }, // i18n-ignore
              { value: "en", label: "English" },
            ]}
          />
        </div>
        <div className="border-b border-line px-4 py-3.5">
          <div className="text-[16px] font-semibold">{t("Тема")}</div>
          <Segmented<ThemePreference>
            className="mt-2.5 w-full"
            layoutKey="theme"
            value={theme.preference}
            onChange={(p) => theme.setPreference(p)}
            options={[
              { value: "system", label: t("Как в системе") },
              { value: "light", label: t("Светлая") },
              { value: "dark", label: t("Тёмная") },
            ]}
          />
        </div>
        <Row label={t("Обложки из интернета")} hint={t("Для книг без обложки — поиск по названию в Apple Books, Google Books и Open Library")}>
          <Switch on={covers.online} onChange={covers.set} label={t("Искать обложки в интернете")} />
        </Row>
      </Group>

      <Group title={t("Сервисы")}>
        <div className="border-b border-line"><ElevenLabsSettings /></div>
        <LibrarrSettings />
      </Group>

      <Group title={`${t("Хранилище")} · ${formatBytes(libraryBytes)}`}>
        {estimate && estimate.quota > 0 && (
          <div className="border-b border-line px-4 py-3.5">
            <div className="tabular flex justify-between text-[14px] text-ink-2">
              <span>{t("Занято {size}", { size: formatBytes(estimate.usage) })}</span>
              <span>{t("из {size}", { size: formatBytes(estimate.quota) })}</span>
            </div>
            <ProgressBar value={estimate.usage / estimate.quota} className="mt-2" />
          </div>
        )}
        <Row
          label={t("Не удалять книги")}
          hint={estimate?.persisted ? t("Включено — система не удалит книги.") : t("Без этого браузер может очистить данные при нехватке места.")}
        >
          {estimate?.persisted ? (
            <span className="text-[14px] font-semibold text-ink-2">{t("Включено")}</span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const ok = await requestPersistentStorage();
                setEstimate(await storageEstimate());
                toast(ok ? t("Хранилище закреплено") : t("Браузер отклонил запрос — установите приложение на экран «Домой»"), ok ? "success" : "info");
              }}
            >
              {t("Включить")}
            </Button>
          )}
        </Row>
        {(books?.length ?? 0) > 0 && (
          <Row label={t("Очистить библиотеку")} hint={t("Удалит все книги и прогресс с этого устройства")}>
            {!confirm ? (
              <Button variant="secondary" size="sm" onClick={() => setConfirm(true)}>{t("Удалить…")}</Button>
            ) : (
              <Button
                size="sm"
                className="bg-[#B3261E] text-white"
                onClick={async () => {
                  closePlayer();
                  for (const b of books ?? []) await deleteBook(b.id);
                  setConfirm(false);
                  toast(t("Библиотека очищена"));
                }}
              >
                {t("Удалить {n}", { n: books?.length ?? 0 })}
              </Button>
            )}
          </Row>
        )}
      </Group>

      <Group title={t("Установка на телефон")}>
        {[
          ["iPhone", t("Safari → «Поделиться» → «На экран „Домой“». Приложение откроется без панели браузера.")],
          ["Android", t("Chrome → меню → «Установить приложение».")],
          [t("Папки на iPhone"), t("В «Файлах» удерживайте папку с аудиокнигой → «Сжать» и добавьте получившийся ZIP.")],
        ].map(([k, v]) => (
          <Row key={k} label={k} hint={v} />
        ))}
      </Group>

      <p className="mt-7 px-1 text-[13.5px] leading-[1.55] text-ink-2">
        {t("Все книги магазина — общественное достояние: авторы и переводчики умерли больше 70 лет назад, книги изданы до 1931 года. Русская классика взята из открытого корпуса RussianNovels, английские издания — из Standard Ebooks (CC0). Аудиокниги озвучены синтезатором речи RHVoice.")}
      </p>
    </main>
  );
}

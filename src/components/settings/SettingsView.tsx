"use client";

import { HardDrive, Monitor, Moon, Share, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, Eyebrow, MetallicButton, ProgressBar, Segmented } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { closePlayer } from "@/lib/audio/player";
import { formatBytes } from "@/lib/format";
import { useBooks } from "@/lib/library/hooks";
import { deleteBook } from "@/lib/library/repository";
import { requestPersistentStorage, storageEstimate } from "@/lib/storage/blobStore";
import { useTheme, type ThemePreference } from "@/lib/theme";

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mt-7", className)}>
      <Eyebrow className="px-1">{title}</Eyebrow>
      <div className="mt-2 rounded-[22px] p-4 metal-card">{children}</div>
    </section>
  );
}

export function SettingsView() {
  const theme = useTheme();
  const books = useBooks();
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
    <main className="mx-auto max-w-[640px] px-5 pt-[calc(var(--sat)+28px)]">
      <Eyebrow>Titan</Eyebrow>
      <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.035em]">Настройки</h1>

      <Section title="Оформление">
        <Segmented<ThemePreference>
          layoutKey="theme"
          className="w-full"
          value={theme.preference}
          onChange={(p) => theme.setPreference(p)}
          options={[
            { value: "system", label: "Система", icon: <Monitor size={14} /> },
            { value: "light", label: "Серебро", icon: <Sun size={14} /> },
            { value: "dark", label: "Графит", icon: <Moon size={14} /> },
          ]}
        />
        <p className="mt-3 text-[12.5px] leading-snug text-ink-3">
          «Brushed Silver» — холодная светлая тема, «Obsidian Graphite» — тёмная. Цвет бумаги в читалке настраивается отдельно (Aa).
        </p>
      </Section>

      <Section title="Хранилище">
        <div className="flex items-center gap-3">
          <HardDrive size={18} className="text-steel" />
          <div className="flex-1">
            <div className="text-[14.5px] font-medium tabular">Книги: {formatBytes(libraryBytes)}</div>
            {estimate && estimate.quota > 0 && (
              <div className="text-[12px] text-ink-2 tabular">Использовано {formatBytes(estimate.usage)} из {formatBytes(estimate.quota)}</div>
            )}
          </div>
        </div>
        {estimate && estimate.quota > 0 && <ProgressBar value={estimate.usage / estimate.quota} className="mt-3" />}
        <div className="mt-4 flex items-center gap-3">
          <ShieldCheck size={18} className={estimate?.persisted ? "text-steel" : "text-ink-3"} />
          <div className="flex-1 text-[13px] text-ink-2">
            {estimate?.persisted ? "Постоянное хранилище включено — система не удалит книги." : "Браузер может очистить данные при нехватке места."}
          </div>
          {!estimate?.persisted && (
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
        </div>
        <p className="mt-3 text-[12px] leading-snug text-ink-3">Файлы хранятся в Origin Private File System или IndexedDB — только на этом устройстве.</p>
        {(books?.length ?? 0) > 0 && (
          <div className="mt-4">
            {!confirm ? (
              <MetallicButton variant="ghost" size="sm" className="text-ink-2" icon={<Trash2 size={14} />} onClick={() => setConfirm(true)}>
                Очистить библиотеку
              </MetallicButton>
            ) : (
              <MetallicButton
                size="sm"
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  closePlayer();
                  for (const b of books ?? []) await deleteBook(b.id);
                  setConfirm(false);
                  toast("Библиотека очищена");
                }}
              >
                Удалить все книги ({books?.length})
              </MetallicButton>
            )}
          </div>
        )}
      </Section>

      <Section title="Установка на iPhone и Android">
        <ol className="space-y-2.5 text-[13.5px] leading-snug text-ink-2">
          <li className="flex gap-2.5"><span className="font-semibold text-ink tabular">1</span><span>iPhone: откройте сайт в Safari и нажмите <Share size={13} className="inline -translate-y-px" /> «Поделиться».</span></li>
          <li className="flex gap-2.5"><span className="font-semibold text-ink tabular">2</span><span>Выберите «На экран „Домой“» — Titan запустится как приложение, без панели браузера.</span></li>
          <li className="flex gap-2.5"><span className="font-semibold text-ink tabular">3</span><span>Android: меню Chrome → «Установить приложение».</span></li>
        </ol>
        <p className="mt-3 text-[12px] text-ink-3">Управление воспроизведением доступно на экране блокировки, в Пункте управления и на AirPods.</p>
      </Section>

      <Section title="О контенте магазина" className="mb-4">
        <p className="text-[13px] leading-relaxed text-ink-2">
          Все книги каталога — общественное достояние. Русская классика взята из открытого корпуса RussianNovels,
          англоязычные издания — из Standard Ebooks (CC0). Аудиокниги озвучены синтезатором речи RHVoice.
          Обложки — оригинальные типографические работы Titan.
        </p>
      </Section>
    </main>
  );
}

"use client";

import { Check, Download, EllipsisVertical, Maximize2, Share, Smartphone, SquarePlus, WifiOff, X, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, cn, Segmented } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { t } from "@/lib/i18n";
import { hideInstallCard, installCardHidden, installNow, installPlatform, isInstalled, useInstall, type InstallPlatform } from "@/lib/install";

export const openInstallGuide = () => useInstall.setState({ open: true });

/**
 * A small card on the home screen of a phone's browser: the site can live on the home screen as an app. A tap
 * installs it where the browser can (Android's Chrome), or opens the two-step guide; the cross puts it away for a
 * month. Not shown once the app is installed, nor in the apps.
 */
export function InstallCard({ toned, className }: { toned?: boolean; className?: string }) {
  const offer = useInstall((s) => s.offer);
  const installed = useInstall((s) => s.installed);
  // Known only in the browser, after hydration.
  const [show, setShow] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the browser
    setShow(installPlatform() !== "other" && !isInstalled() && !installCardHidden());
  }, []);
  if (!show || installed) return null;

  return (
    <div
      data-install-card
      className={cn("flex items-center gap-3.5 rounded-[22px] p-4", toned ? "bg-t-chip text-t-ink" : "bg-surface ring-1 ring-line", className)}
    >
      <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]", toned ? "bg-t-btn text-t-btn-ink" : "bg-ink text-bg")}>
        <Smartphone size={24} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] font-bold leading-tight">{t("Boowie как приложение")}</div>
        <div className={cn("mt-0.5 text-[13.5px] leading-snug", toned ? "text-t-ink-2" : "text-ink-2")}>
          {t("Добавьте на экран «Домой» — откроется во весь экран и без интернета.")}
        </div>
        <button
          type="button"
          onClick={() => (offer ? void installNow() : openInstallGuide())}
          className={cn("mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold", toned ? "bg-t-btn text-t-btn-ink" : "bg-ink text-bg")}
        >
          {offer ? <><Download size={16} strokeWidth={2.2} /> {t("Установить")}</> : t("Как это сделать")}
        </button>
      </div>
      <button
        type="button"
        aria-label={t("Скрыть")}
        onClick={() => {
          hideInstallCard();
          setShow(false);
        }}
        className={cn("-mr-1 -mt-8 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full", toned ? "text-t-ink-2" : "text-ink-3")}
      >
        <X size={18} />
      </button>
    </div>
  );
}

function Step({ n, icon: Icon, title, hint }: { n: number; icon: LucideIcon; title: string; hint?: string }) {
  return (
    <li className="flex gap-3.5">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-surface-2">
        <Icon size={21} strokeWidth={2} />
        <span className="tabular absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-[11.5px] font-bold text-bg">{n}</span>
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-[15.5px] font-semibold leading-snug">{title}</div>
        {hint && <div className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{hint}</div>}
      </div>
    </li>
  );
}

/** «Установить как приложение»: why, and the steps for this phone (or either, chosen at the top). */
export function InstallSheet() {
  const open = useInstall((s) => s.open);
  const offer = useInstall((s) => s.offer);
  const [platform, setPlatform] = useState<Exclude<InstallPlatform, "other">>("ios");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the phone is known only in the browser
    if (open) setPlatform(installPlatform() === "android" ? "android" : "ios");
  }, [open]);
  const close = () => useInstall.setState({ open: false });

  return (
    <Sheet open={open} onClose={close} title={t("Установить как приложение")}>
      <div className="px-5 pb-4">
        <ul className="grid grid-cols-3 gap-2 text-center text-[12.5px] font-medium leading-tight text-ink-2">
          {[
            [Smartphone, t("Свой значок на экране «Домой»")],
            [Maximize2, t("Во весь экран, без панели браузера")],
            [WifiOff, t("Книги и места в них — без интернета")],
          ].map(([Icon, text]) => {
            const I = Icon as LucideIcon;
            return (
              <li key={text as string} className="flex flex-col items-center gap-1.5 rounded-[16px] bg-surface-2 px-2 py-3">
                <I size={20} strokeWidth={2} className="text-ink" />
                {text as string}
              </li>
            );
          })}
        </ul>

        {offer && (
          <Button size="lg" className="mt-4 w-full" icon={<Download size={18} />} onClick={() => void installNow()}>
            {t("Установить")}
          </Button>
        )}

        <Segmented
          className="mt-5 w-full"
          layoutKey="install-platform"
          value={platform}
          onChange={setPlatform}
          options={[
            { value: "ios", label: "iPhone · iPad" },
            { value: "android", label: "Android" },
          ]}
        />

        {platform === "ios" ? (
          <ol className="mt-5 space-y-4" data-steps="ios">
            <Step n={1} icon={Share} title={t("Нажмите «Поделиться»")} hint={t("В Safari — квадрат со стрелкой вверх: внизу экрана или в меню «⋯». В других браузерах — в их меню.")} />
            <Step n={2} icon={SquarePlus} title={t("Выберите «На экран „Домой“»")} hint={t("Если пункта не видно, пролистайте список вниз.")} />
            <Step n={3} icon={Check} title={t("Нажмите «Добавить»")} hint={t("Переключатель «Открыть как веб-приложение» оставьте включённым.")} />
          </ol>
        ) : (
          <ol className="mt-5 space-y-4" data-steps="android">
            <Step n={1} icon={EllipsisVertical} title={t("Откройте меню браузера")} hint={t("Три точки: вверху справа в Chrome, внизу в Samsung Internet.")} />
            <Step n={2} icon={Download} title={t("Выберите «Установить приложение»")} hint={t("Или «Добавить на главный экран» — в некоторых браузерах он называется так.")} />
            <Step n={3} icon={Check} title={t("Подтвердите")} hint={t("Значок Boowie появится рядом с другими приложениями.")} />
          </ol>
        )}

        <p className="mt-5 text-[13px] leading-snug text-ink-2" data-storage-note>
          {platform === "ios"
            ? t("На iPhone и iPad приложение хранит книги отдельно от Safari: войдите в нём в аккаунт — и библиотека с местами в книгах подтянется.")
            : t("Книги, закладки и статистика останутся теми же: на Android приложение и браузер хранят их в одном месте.")}
        </p>
      </div>
    </Sheet>
  );
}

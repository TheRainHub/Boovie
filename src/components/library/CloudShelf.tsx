"use client";

import { Download, X } from "lucide-react";
import { BookCover } from "@/components/ui/BookCover";
import { cn, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { storeItem } from "@/data/catalog";
import { useIdentity } from "@/lib/account/identity";
import { formatBytes, formatDuration, formatLabel } from "@/lib/format";
import { t } from "@/lib/i18n";
import { downloadFromSource, LibrarrError } from "@/lib/integrations/librarr";
import { downloadFromCloud } from "@/lib/account/cloudFiles";
import { removeFromAccount, useCloudShelf } from "@/lib/library/cloud";
import { downloadStoreItem, useImports } from "@/lib/library/importer";
import type { CloudEntry } from "@/lib/storage/types";
import { useState } from "react";

/** The account's books that aren't on this device: download one here (its place comes with it), or drop it. */
export function CloudShelf({ className }: { className?: string }) {
  const entries = useCloudShelf();
  const signedIn = useIdentity((s) => s.status === "signedIn");
  if (!signedIn || !entries?.length) return null;
  return (
    <section className={cn("px-5 pt-9 sm:px-8", className)} aria-labelledby="cloud-shelf">
      <h2 id="cloud-shelf" className="text-[20px] font-extrabold tracking-[-0.015em]">{t("В аккаунте")}</h2>
      <p className="mt-1 max-w-[560px] text-[14px] leading-[1.45] text-ink-2">
        {t("Книги с других ваших устройств. Скачайте, чтобы читать и слушать здесь, — место в книге придёт вместе с ней.")}
      </p>
      <ul className="mt-3 max-w-[720px] divide-y divide-line">
        {entries.map((e) => <CloudRow key={e.key} entry={e} />)}
      </ul>
    </section>
  );
}

function CloudRow({ entry }: { entry: CloudEntry }) {
  const item = entry.storeId ? storeItem(entry.storeId) : undefined;
  const job = useImports((s) => s.jobs.find((j) => j.status === "running" && (item ? j.storeId === item.id : j.id === `cloud-${entry.key}` || j.label === entry.title)));
  const [busy, setBusy] = useState(false);
  const audio = entry.format === "audio";
  const meta = [formatLabel(entry.format), entry.duration ? formatDuration(entry.duration) : entry.fileSize ? formatBytes(entry.fileSize) : null].filter(Boolean).join(" · ");

  const download = async () => {
    setBusy(true);
    try {
      if (item) await downloadStoreItem(item);
      else if (entry.source) await downloadFromSource(entry.source, entry.title);
      else await downloadFromCloud(entry);
      toast(t("«{title}» в ваших книгах", { title: entry.title }), "success");
    } catch (e) {
      toast(e instanceof LibrarrError ? e.message : t("Не удалось скачать книгу. Проверьте подключение."), "error");
    } finally {
      setBusy(false);
    }
  };

  const canDownload = !!item || entry.kind === "librarr" || (entry.kind === "file" && !!entry.inCloud);
  return (
    <li className="flex items-center gap-3.5 py-3" data-cloud-key={entry.key}>
      <div className={audio ? "w-14 shrink-0" : "w-11 shrink-0"}>
        <BookCover url={entry.coverUrl ?? item?.coverUrl} title={entry.title} author={entry.author} square={audio} sizes="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-semibold leading-tight">{entry.title}</div>
        <div className="truncate text-[13.5px] text-ink-2">{[entry.author, meta].filter(Boolean).join(" · ")}</div>
        {!canDownload && <div className="mt-0.5 text-[12.5px] text-ink-3">{t("Свой файл: появится здесь, когда другое устройство загрузит его в облако")}</div>}
      </div>
      {canDownload && (
        <button
          type="button"
          onClick={() => void download()}
          disabled={busy || !!job}
          aria-label={t("Скачать: {title}", { title: entry.title })}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[14px] font-semibold text-bg active:opacity-80 disabled:opacity-60"
        >
          {busy || job ? <Spinner size={16} /> : <Download size={16} strokeWidth={2.2} />}
          {job ? `${Math.round((job.progress ?? 0) * 100)}%` : t("Скачать")}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          void removeFromAccount(entry);
          toast(t("Убрано из аккаунта"));
        }}
        aria-label={t("Убрать из аккаунта: {title}", { title: entry.title })}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-ink/5"
      >
        <X size={18} />
      </button>
    </li>
  );
}

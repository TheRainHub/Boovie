"use client";

import { FilePlus, FolderPlus } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { importLocalFiles } from "@/lib/library/importer";

/**
 * Two import keys: files (any mix of PDF/FB2/EPUB/audio/ZIP) and a whole folder (one audiobook per folder,
 * one file per chapter). Also a drop target on desktop.
 *
 * No `accept` filter on purpose: iOS greys out types it cannot map (.fb2 has no system type, .m4b is typed as
 * "protected audio"), so every file stays selectable and unsupported ones get a clear error instead.
 */
export function UploadDropzone({ compact }: { compact?: boolean }) {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = async (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    if (!picked.length) return;
    const ids = await importLocalFiles(picked);
    if (ids.length) toast(ids.length === 1 ? "Книга на полке" : `Добавлено книг: ${ids.length}`, "success");
  };

  const key = "group flex h-[52px] flex-1 items-center gap-3 rounded-[4px] border border-ink/20 px-3.5 text-left transition-colors hover:border-ink/45 active:translate-y-px";
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void handle(e.dataTransfer.files);
      }}
      className={cn("rounded-[6px] transition-colors", over && "bg-steel/10 outline outline-1 outline-dashed outline-steel")}
    >
      <div className="flex gap-2">
        <button type="button" className={key} onClick={() => files.current?.click()}>
          <FilePlus size={18} strokeWidth={1.5} className="shrink-0 text-ink-2" />
          <span className="min-w-0">
            <span className="block text-[14px] font-medium leading-tight">Файлы</span>
            <span className="num block truncate text-[10px] text-ink-3">PDF FB2 EPUB MP3 M4B ZIP</span>
          </span>
        </button>
        <button type="button" className={key} onClick={() => folder.current?.click()}>
          <FolderPlus size={18} strokeWidth={1.5} className="shrink-0 text-ink-2" />
          <span className="min-w-0">
            <span className="block text-[14px] font-medium leading-tight">Папка</span>
            <span className="block truncate text-[11px] text-ink-3">файл = глава</span>
          </span>
        </button>
      </div>
      {!compact && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
          Папка с аудиофайлами станет одной книгой: главы — по порядку треков, обложка — <span className="num text-[10.5px]">cover.jpg</span> из папки или найдётся по названию.
          На iPhone: в «Файлах» удерживайте папку → «Сжать» и выберите получившийся <span className="num text-[10.5px]">.zip</span>.
        </p>
      )}
      <input ref={files} type="file" multiple className="hidden" onChange={(e) => { void handle(e.target.files); e.target.value = ""; }} />
      <input
        ref={folder}
        type="file"
        multiple
        className="hidden"
        // Non-standard but supported by Chromium, Firefox and Safari; React passes unknown lowercase attributes through.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => { void handle(e.target.files); e.target.value = ""; }}
      />
    </div>
  );
}

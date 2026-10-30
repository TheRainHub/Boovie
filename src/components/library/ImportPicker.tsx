"use client";

import { FilePlus2, FolderPlus } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toaster";
import { importLocalFiles } from "@/lib/library/importer";
import { t } from "@/lib/i18n";

async function importPicked(list: FileList | null) {
  const picked = list ? Array.from(list) : [];
  if (!picked.length) return;
  const ids = await importLocalFiles(picked);
  if (ids.length) toast(ids.length === 1 ? t("Книга добавлена") : t("Добавлено книг: {n}", { n: ids.length }), "success");
}

/**
 * Hidden file inputs for importing: files (any mix of PDF/FB2/EPUB/audio/ZIP) and a whole folder (one audiobook
 * per folder, one file per chapter). Render `inputs` once and call `openFiles` / `openFolder` from any button.
 *
 * No `accept` filter on purpose: iOS greys out types it cannot map (.fb2 has no system type, .m4b is typed as
 * "protected audio"), so every file stays selectable and unsupported ones get a clear error instead.
 */
export function useImportPicker() {
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const inputs = (
    <>
      <input ref={files} type="file" multiple className="hidden" onChange={(e) => { void importPicked(e.target.files); e.target.value = ""; }} />
      <input
        ref={folder}
        type="file"
        multiple
        className="hidden"
        // Non-standard but supported by Chromium, Firefox and Safari; React passes unknown lowercase attributes through.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => { void importPicked(e.target.files); e.target.value = ""; }}
      />
    </>
  );
  return {
    inputs,
    openFiles: useCallback(() => files.current?.click(), []),
    openFolder: useCallback(() => folder.current?.click(), []),
  };
}

/** Desktop drag-and-drop anywhere over the children. */
export function DropTarget({ children, className }: { children: ReactNode; className?: string }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn("relative", className)}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void importPicked(e.dataTransfer.files);
      }}
    >
      {children}
      {over && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-[28px] border-2 border-dashed border-ink/40 bg-bg/80 text-[20px] font-bold backdrop-blur-sm">
          {t("Отпустите, чтобы добавить")}
        </div>
      )}
    </div>
  );
}

/** «Добавить»: two big choices with a line on what each does. */
export function ImportSheet({ open, onClose, onFiles, onFolder }: { open: boolean; onClose: () => void; onFiles: () => void; onFolder: () => void }) {
  const row = "flex w-full items-center gap-4 rounded-[18px] bg-surface-2 px-4 py-4 text-left active:opacity-80";
  return (
    <Sheet open={open} onClose={onClose} title={t("Добавить")}>
      <div className="grid gap-2 px-5 pb-3 pt-2">
        <button type="button" className={row} onClick={() => { onClose(); onFiles(); }}>
          <FilePlus2 size={26} strokeWidth={1.8} className="shrink-0" />
          <span>
            <span className="block text-[17px] font-bold">{t("Файлы")}</span>
            <span className="block text-[14px] text-ink-2">{t("PDF, FB2, EPUB, MP3, M4B или ZIP")}</span>
          </span>
        </button>
        <button type="button" className={row} onClick={() => { onClose(); onFolder(); }}>
          <FolderPlus size={26} strokeWidth={1.8} className="shrink-0" />
          <span>
            <span className="block text-[17px] font-bold">{t("Папку с аудиокнигой")}</span>
            <span className="block text-[14px] text-ink-2">{t("Каждый файл станет главой, обложка — из папки")}</span>
          </span>
        </button>
        <p className="px-1 pt-2 text-[13.5px] leading-relaxed text-ink-2">
          {t("На iPhone папку не выбрать напрямую: в «Файлах» удерживайте её → «Сжать», затем добавьте получившийся ZIP. Обложку для книги без картинки приложение найдёт по названию.")}
        </p>
      </div>
    </Sheet>
  );
}

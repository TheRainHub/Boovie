"use client";

import { FilePlus2 } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { importLocalFiles } from "@/lib/library/importer";

export const ACCEPT =
  ".pdf,.fb2,.epub,.zip,.mp3,.m4a,.m4b,.aac,.ogg,.oga,.opus,.wav,.flac,application/pdf,application/epub+zip,audio/*";

/** Prominent import target: tap to pick from Files (iOS) / storage (Android), or drag & drop on desktop. */
export function UploadDropzone({ compact }: { compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = async (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    const ids = await importLocalFiles(files);
    if (ids.length) toast(ids.length === 1 ? "Книга добавлена на полку" : `Добавлено книг: ${ids.length}`, "success");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
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
        className={cn(
          "group relative flex w-full items-center gap-4 overflow-hidden rounded-[22px] border border-dashed text-left transition-[border-color,background] duration-200",
          over ? "border-steel bg-steel/10" : "border-ink-3/40 hover:border-ink-2/60",
          compact ? "px-4 py-3.5" : "px-5 py-5",
          "metal-card",
        )}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] bg-[linear-gradient(180deg,#2B3038_0%,#1E2229_55%,#181B21_100%)] dark:bg-[linear-gradient(180deg,#F7F8FA_0%,#E2E6ED_50%,#C9CFD8_100%)]">
          <FilePlus2 size={22} strokeWidth={1.8} />
        </span>
        <span className="min-w-0">
          <span className="block text-[16px] font-semibold tracking-[-0.01em]">+ Загрузить файл</span>
          <span className="mt-0.5 block text-[13px] text-ink-2">PDF, FB2, EPUB, MP3 / M4B</span>
          {!compact && (
            <span className="mt-1 block text-[12px] leading-snug text-ink-3">
              Выберите сразу несколько MP3 — они соберутся в одну аудиокнигу по порядку треков. Файлы хранятся только на устройстве.
            </span>
          )}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

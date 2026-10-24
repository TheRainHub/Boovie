"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "@/components/ui/Toaster";
import type { StoreItem } from "@/data/catalog";
import { openAudioBook, usePlayer } from "@/lib/audio/player";
import { stopPreview } from "@/lib/audio/preview";
import { useStoreIdsInLibrary } from "@/lib/library/hooks";
import { downloadStoreItem, useImports } from "@/lib/library/importer";

/** Shared download / open logic for store cards and the details sheet. */
export function useStoreActions() {
  const router = useRouter();
  const owned = useStoreIdsInLibrary();
  const jobs = useImports((s) => s.jobs);

  const jobFor = useCallback((item: StoreItem) => jobs.find((j) => j.storeId === item.id && j.status === "running"), [jobs]);

  const download = useCallback(async (item: StoreItem) => {
    try {
      await downloadStoreItem(item);
      toast(`«${item.title}» в ваших книгах`, "success");
    } catch {
      toast("Не удалось скачать книгу. Проверьте подключение.", "error");
    }
  }, []);

  const open = useCallback(
    async (item: StoreItem) => {
      const bookId = owned?.get(item.id);
      if (!bookId) return;
      stopPreview();
      if (item.kind === "audiobook") {
        await openAudioBook(bookId, { autoplay: true });
        router.push(`/book/?id=${bookId}&mode=listen`);
        usePlayer.getState().setExpanded(false);
      } else {
        router.push(`/book/?id=${bookId}`);
      }
    },
    [owned, router],
  );

  return { owned, jobFor, download, open };
}

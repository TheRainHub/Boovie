"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/primitives";
import { t } from "@/lib/i18n";

/** Auto-hiding bars (top: back, title/toggle, actions; bottom: chapter and position) shared by both readers. */
export function ReaderChrome({
  visible, center, actions, bottom, onTouch,
}: {
  visible: boolean;
  /** Called when the bars are touched (used to cancel the initial auto-hide). */
  onTouch?: () => void;
  center?: ReactNode;
  actions?: ReactNode;
  bottom?: ReactNode;
}) {
  const router = useRouter();
  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            key="top"
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="fixed inset-x-0 top-0 z-30"
            onPointerDown={onTouch}
          >
            <header className="bg-bg/90 pt-[var(--sat)] shadow-[0_1px_0_var(--line)] backdrop-blur-xl">
              <div className="mx-auto flex h-[56px] max-w-[760px] items-center gap-1 px-2">
                <IconButton label={t("Назад")} onClick={back}>
                  <ChevronLeft size={26} strokeWidth={2} />
                </IconButton>
                <div className="flex min-w-0 flex-1 justify-center">{center}</div>
                <div className="flex items-center">{actions}</div>
              </div>
            </header>
          </motion.div>
          {bottom && (
            <motion.div
              key="bottom"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-x-0 bottom-0 z-30"
              onPointerDown={onTouch}
            >
              <footer className="bg-bg/90 pb-[var(--sab)] shadow-[0_-1px_0_var(--line)] backdrop-blur-xl">
                <div className="mx-auto max-w-[760px] px-4 pb-2 pt-3">{bottom}</div>
              </footer>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

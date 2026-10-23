"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { GlassPanel, IconButton } from "@/components/ui/primitives";

/** Auto-hiding glass HUD shared by the text and PDF readers. */
export function ReaderChrome({
  visible, center, actions, bottom,
}: {
  visible: boolean;
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
            className="fixed inset-x-0 top-0 z-30 px-3 pt-[calc(var(--sat)+8px)]"
          >
            <GlassPanel as="header" className="mx-auto flex h-14 max-w-[760px] items-center gap-1 rounded-[22px] px-1.5">
              <IconButton label="Назад" onClick={back}>
                <ChevronLeft size={22} />
              </IconButton>
              <div className="flex min-w-0 flex-1 justify-center">{center}</div>
              <div className="flex items-center">{actions}</div>
            </GlassPanel>
          </motion.div>
          {bottom && (
            <motion.div
              key="bottom"
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(var(--sab)+8px)]"
            >
              <GlassPanel as="footer" className="mx-auto max-w-[760px] rounded-[22px] px-4 py-2.5">{bottom}</GlassPanel>
            </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}

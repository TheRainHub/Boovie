"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn, glassClasses } from "./primitives";

/**
 * Bottom sheet with drag-to-dismiss (grab the handle), backdrop and safe-area padding.
 * `full` makes it a full-height sheet (player, book details).
 */
export function Sheet({
  open, onClose, children, title, full, className, labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  full?: boolean;
  className?: string;
  labelledBy?: string;
}) {
  const drag = useDragControls();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
          <motion.div
            className="absolute inset-0 bg-[#0A0B0D]/35 dark:bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40, mass: 0.9 }}
            className={cn(
              "absolute inset-x-0 bottom-0 mx-auto flex max-w-[640px] flex-col overflow-hidden rounded-t-[14px] border-b-0",
              glassClasses,
              "bg-[#F4F6F9]/92 dark:bg-[#14161B]/92",
              full ? "top-[calc(var(--sat)+10px)]" : "max-h-[86dvh]",
              className,
            )}
          >
            <div
              className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2.5 pb-1 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)}
            >
              <div className="h-[3px] w-9 rounded-[1px] bg-ink-3/50" />
              {title && <div className={cn("mt-3 w-full border-b border-hairline px-5 pb-3", typeof title === "string" && "font-display text-[22px]")}>{title}</div>}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(var(--sab)+16px)]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

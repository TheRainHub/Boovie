"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleAlert, Info } from "lucide-react";
import { create } from "zustand";
import { glassClasses, cn } from "./primitives";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, kind = "info") => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-2), { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === "error" ? 6000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, kind?: ToastKind) => useToasts.getState().push(text, kind);

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 480, damping: 36 }}
            className={cn(glassClasses, "pointer-events-auto flex max-w-[440px] items-center gap-2.5 rounded-[4px] border-l-2 border-l-steel px-3.5 py-2.5 text-[13.5px] text-ink")}
            onClick={() => useToasts.getState().dismiss(t.id)}
          >
            {t.kind === "success" ? <CircleCheck size={18} className="shrink-0 text-steel" /> : t.kind === "error" ? <CircleAlert size={18} className="shrink-0 text-ink" /> : <Info size={18} className="shrink-0 text-ink-2" />}
            <span>{t.text}</span>
          </motion.div>
        ))}
    </AnimatePresence>
  );
}

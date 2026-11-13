"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, CircleAlert, Info } from "lucide-react";
import { create } from "zustand";
import { Badge } from "@/components/profile/Badge";
import type { AchievementIcon } from "@/lib/stats/achievements";
import { cn } from "./primitives";

type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  /** An achievement's badge in place of the icon. */
  badge?: { icon: AchievementIcon; metal: number };
}

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: ToastKind, badge?: Toast["badge"]) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (text, kind = "info", badge) => {
    const id = ++seq;
    set({ toasts: [...get().toasts.slice(-2), { id, kind, text, badge }] });
    setTimeout(() => get().dismiss(id), kind === "error" || badge ? 6000 : 3200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (text: string, kind?: ToastKind) => useToasts.getState().push(text, kind);
/** A new achievement, with its badge. */
export const toastBadge = (text: string, badge: NonNullable<Toast["badge"]>) => useToasts.getState().push(text, "success", badge);

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
            className={cn("pointer-events-auto flex max-w-[440px] items-center gap-2.5 rounded-full bg-ink py-2.5 pl-3.5 pr-4.5 text-[14px] font-medium text-bg shadow-[0_10px_30px_-10px_rgb(0_0_0/0.45)]")}
            onClick={() => useToasts.getState().dismiss(t.id)}
          >
            {t.badge ? <Badge icon={t.badge.icon} metal={t.badge.metal} size={30} className="-my-1 -ml-1.5 shrink-0" /> : t.kind === "success" ? <CircleCheck size={18} className="shrink-0" /> : t.kind === "error" ? <CircleAlert size={18} className="shrink-0" /> : <Info size={18} className="shrink-0 opacity-70" />}
            <span>{t.text}</span>
          </motion.div>
        ))}
    </AnimatePresence>
  );
}

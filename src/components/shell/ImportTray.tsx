"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect } from "react";
import { ProgressBar, Spinner } from "@/components/ui/primitives";
import { cancelJob, useImports } from "@/lib/library/importer";
import { t } from "@/lib/i18n";

/** Floating progress cards for file imports and store downloads. */
export function ImportTray() {
  const jobs = useImports((s) => s.jobs);
  const clear = useImports((s) => s.clearFinished);
  const running = jobs.some((j) => j.status === "running");

  useEffect(() => {
    if (running || jobs.length === 0) return;
    const t = setTimeout(clear, jobs.some((j) => j.status === "error") ? 7000 : 2600);
    return () => clearTimeout(t);
  }, [running, jobs, clear]);

  return (
    <AnimatePresence initial={false}>
        {jobs.filter((j) => j.status !== "done").map((j) => (
          <motion.div
            key={j.id}
            layout
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="pointer-events-auto w-full max-w-[440px] rounded-[18px] bg-surface px-4 py-3 shadow-[0_12px_36px_-12px_rgb(0_0_0/0.35)] ring-1 ring-line"
          >
            <div className="flex items-center gap-3">
              {j.status === "running" ? <Spinner size={18} className="text-ink-2" /> : j.status === "done" ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{j.label}</div>
                <div className="tabular truncate text-[13px] text-ink-2">
                  {j.status === "error" ? j.error : `${j.stage}${j.status === "running" ? ` · ${Math.round(j.progress * 100)}%` : ""}`}
                </div>
              </div>
              {j.status === "running" && j.cancellable && (
                <button type="button" className="rounded-full bg-surface-2 px-3 py-1.5 text-[13px] font-semibold" onClick={() => cancelJob(j.id)}>
                  {t("Стоп")}
                </button>
              )}
              {j.status !== "running" && (
                <button aria-label={t("Скрыть")} className="text-ink-3" onClick={clear}>
                  <X size={16} />
                </button>
              )}
            </div>
            {j.status === "running" && <ProgressBar value={j.progress} className="mt-2.5" />}
          </motion.div>
        ))}
    </AnimatePresence>
  );
}

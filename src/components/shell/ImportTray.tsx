"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect } from "react";
import { cn, glassClasses, ProgressBar, Spinner } from "@/components/ui/primitives";
import { useImports } from "@/lib/library/importer";

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
            className={cn(glassClasses, "pointer-events-auto w-full max-w-[440px] rounded-[4px] px-3.5 py-2.5")}
          >
            <div className="flex items-center gap-3">
              {j.status === "running" ? <Spinner size={16} /> : j.status === "done" ? <CircleCheck size={17} className="text-steel" /> : <CircleAlert size={17} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium">{j.label}</div>
                <div className="num truncate text-[11px] text-ink-2">
                  {j.status === "error" ? j.error : `${j.stage}${j.status === "running" ? ` · ${Math.round(j.progress * 100)}%` : ""}`}
                </div>
              </div>
              {j.status !== "running" && (
                <button aria-label="Скрыть" className="text-ink-3" onClick={clear}>
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

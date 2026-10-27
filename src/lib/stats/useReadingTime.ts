"use client";

import { useEffect, useRef } from "react";
import { recordReading } from "./activity";

const TICK_MS = 5_000;
/** A page takes a while to read, but a reader left open on the table isn't reading. */
const IDLE_MS = 4 * 60_000;

/**
 * Counts the time a book is actually being read: the reader is on screen and was touched (page turn, scroll,
 * tap, key) within the last few minutes. Returns `touch` for interactions the window listeners don't see.
 */
export function useReadingTime(bookId: string): () => void {
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    let prev = Date.now();
    const tick = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(now - prev, TICK_MS * 2);
      prev = now;
      if (document.visibilityState === "visible" && now - last.current < IDLE_MS) recordReading(bookId, elapsed / 1000);
    }, TICK_MS);
    const touch = () => {
      last.current = Date.now();
    };
    const opts = { passive: true, capture: true } as const;
    for (const ev of ["pointerdown", "keydown", "wheel", "scroll", "touchstart"]) window.addEventListener(ev, touch, opts);
    return () => {
      clearInterval(tick);
      for (const ev of ["pointerdown", "keydown", "wheel", "scroll", "touchstart"]) window.removeEventListener(ev, touch, opts);
    };
  }, [bookId]);
  return () => {
    last.current = Date.now();
  };
}

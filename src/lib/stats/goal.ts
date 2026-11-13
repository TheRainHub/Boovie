"use client";

/**
 * «Цель на день»: minutes with books a day (reading and listening together). The goal is chosen on the device
 * (20 minutes until changed, 0 for none); the minutes come from the profile's activity rows, so they include the
 * account's other devices. Reaching it is announced once a day.
 */
import { useSyncExternalStore } from "react";
import { currentOwner } from "../account/identity";
import { getDB } from "../storage/db";
import type { ActivityRecord } from "../storage/types";
import { dayKey } from "./activity";

export const GOAL_CHOICES = [5, 10, 15, 20, 30, 45, 60, 90];
const KEY = "boowie-goal";
const DONE_KEY = "boowie-goal-done";
const DEFAULT = 20;

const listeners = new Set<() => void>();

function read(): number {
  try {
    const v = localStorage.getItem(KEY);
    if (v === null) return DEFAULT;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setGoal(minutes: number): void {
  try {
    localStorage.setItem(KEY, String(minutes));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

/** The goal in minutes (0: none). The static export renders without one; the device's comes after hydration. */
export function useGoal(): number | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    () => null,
  );
}

export function secondsOn(rows: ActivityRecord[], day: string): number {
  let s = 0;
  for (const r of rows) if (r.day === day) s += r.seconds;
  return s;
}

/** This week, Monday to Sunday: each day's seconds and whether it is still ahead. */
export function weekOf(rows: ActivityRecord[], now = new Date()): { day: string; seconds: number; future: boolean; today: boolean }[] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7), 12);
  const today = dayKey(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const day = dayKey(d);
    return { day, seconds: secondsOn(rows, day), future: day > today, today: day === today };
  });
}

/** Days in a row (up to today, or yesterday while today's goal isn't reached yet) with the goal reached. */
export function goalStreak(rows: ActivityRecord[], goal: number, now = new Date()): number {
  if (!goal) return 0;
  const per = new Map<string, number>();
  for (const r of rows) per.set(r.day, (per.get(r.day) ?? 0) + r.seconds);
  const met = (d: Date) => (per.get(dayKey(d)) ?? 0) >= goal * 60;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
  if (!met(cursor)) cursor.setDate(cursor.getDate() - 1);
  let n = 0;
  while (met(cursor)) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

/** Today's rows of the current account (or guest), for the goal's check. */
async function todayRows(): Promise<ActivityRecord[]> {
  return getDB().activity.where("owner").equals(currentOwner()).toArray();
}

/** Has today's goal just been reached? Calls `announce` once a day (with the days in a row). */
export async function checkGoal(announce: (goal: number, streak: number) => void): Promise<void> {
  const goal = read();
  if (!goal) return;
  const today = dayKey();
  try {
    if (localStorage.getItem(DONE_KEY) === today) return;
  } catch {
    return;
  }
  const rows = await todayRows();
  if (secondsOn(rows, today) < goal * 60) return;
  try {
    localStorage.setItem(DONE_KEY, today);
  } catch {
    /* private mode */
  }
  announce(goal, goalStreak(rows, goal));
}

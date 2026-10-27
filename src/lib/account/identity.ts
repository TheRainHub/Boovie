"use client";

/**
 * Who the statistics on this device belong to: a stable id for the device, and the signed-in account
 * (`owner`), or "guest". Kept apart from the Supabase client so the trackers never load it.
 */
import { create } from "zustand";
import { newId } from "../storage/blobStore";

const DEVICE_KEY = "boowie-device-id";
export const GUEST = "guest";

let device: string | null = null;

export function deviceId(): string {
  if (device) return device;
  try {
    device = localStorage.getItem(DEVICE_KEY);
    if (!device) {
      device = newId("d");
      localStorage.setItem(DEVICE_KEY, device);
    }
  } catch {
    device = device ?? newId("d");
  }
  return device;
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
}

interface IdentityState {
  /** "off" — accounts aren't configured in this build; "loading" — the session is being restored. */
  status: "off" | "loading" | "guest" | "signedIn";
  user: AccountUser | null;
  /** Opened from a password-reset email: ask for a new password. */
  recovery: boolean;
  sync: { state: "idle" | "syncing" | "error"; at?: number; error?: string };
}

export const useIdentity = create<IdentityState>(() => ({ status: "loading", user: null, recovery: false, sync: { state: "idle" } }));

/** The owner new statistics are recorded for. */
export function currentOwner(): string {
  return useIdentity.getState().user?.id ?? GUEST;
}

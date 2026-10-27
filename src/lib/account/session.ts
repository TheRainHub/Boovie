"use client";

/**
 * Accounts (Supabase Auth) and syncing statistics to them. The Supabase client is loaded only when it's needed —
 * a saved session, an auth link in the address, or the sign-in form — so the app stays as light without it.
 * Without the two public env vars below the build simply has no accounts and everything stays on the device.
 *
 * Statistics: each device uploads its own daily rows (absolute totals, so an upload can be repeated safely) and
 * downloads the other devices' rows; the profile adds them up. Time spent without an account on this device
 * moves into the account at sign-in.
 */
import type { AuthError, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { withBase } from "../basePath";
import { flushActivity, onActivityWritten, rowId } from "../stats/activity";
import { getDB } from "../storage/db";
import type { ActivityRecord } from "../storage/types";
import { deviceId, GUEST, useIdentity, type AccountUser } from "./identity";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const accountsEnabled = !!(SUPABASE_URL && SUPABASE_KEY);
const STORAGE_KEY = "boowie-auth";
const TABLE = "activity";
const CONFLICT = "user_id,device_id,day,book_key,kind";

let clientPromise: Promise<SupabaseClient> | null = null;

function client(): Promise<SupabaseClient> {
  clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) => {
    const c = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { storageKey: STORAGE_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" },
    });
    c.auth.onAuthStateChange((event, session) => {
      apply(session);
      if (event === "PASSWORD_RECOVERY") useIdentity.setState({ recovery: true });
      // Supabase calls made inside this callback can deadlock the client: run them afterwards.
      if (session?.user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        const id = session.user.id;
        setTimeout(() => void afterSignIn(id), 0);
      }
    });
    return c;
  });
  return clientPromise;
}

function toUser(u: User): AccountUser {
  const email = u.email ?? "";
  const name = typeof u.user_metadata?.name === "string" && u.user_metadata.name.trim() ? u.user_metadata.name.trim() : email.split("@")[0];
  return { id: u.id, email, name };
}

function apply(session: Session | null): void {
  useIdentity.setState(session?.user ? { status: "signedIn", user: toUser(session.user) } : { status: "guest", user: null, recovery: false });
}

/** At app start: restore a saved session (or finish an email link) without loading Supabase for guests. */
export async function startAccount(): Promise<void> {
  if (!accountsEnabled) {
    useIdentity.setState({ status: "off" });
    return;
  }
  onActivityWritten(() => syncSoon());
  let saved = false;
  try {
    saved = !!localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked */
  }
  const authLink = /access_token=|error_description=|type=recovery/.test(location.hash + location.search);
  if (!saved && !authLink) {
    useIdentity.setState({ status: "guest" });
    return;
  }
  await client();
}

function redirectUrl(): string {
  return `${location.origin}${withBase("/profile/")}`;
}

/** Russian text for an auth error. */
function message(error: AuthError | Error): string {
  const code = "code" in error ? String(error.code ?? "") : "";
  const text = error.message ?? "";
  if (code === "invalid_credentials" || /invalid login credentials/i.test(text)) return "Неверная почта или пароль";
  if (code === "email_not_confirmed") return "Сначала подтвердите почту: откройте ссылку из письма";
  if (code === "user_already_exists" || code === "email_exists" || /already registered/i.test(text)) return "Этот адрес уже зарегистрирован — войдите";
  if (code === "weak_password" || /password should be/i.test(text)) return "Пароль слишком простой: нужно не меньше 6 символов";
  if (code.startsWith("over_") || /rate limit/i.test(text)) return "Слишком много попыток, подождите минуту";
  if (code === "email_address_invalid" || code === "validation_failed") return "Проверьте адрес почты";
  if (code === "signup_disabled") return "Регистрация на сервере выключена";
  if (error.name === "AuthRetryableFetchError" || /fetch|network/i.test(text)) return "Нет связи с сервером аккаунтов";
  return text || "Что-то пошло не так";
}

/** Run an auth call; its error becomes an Error with Russian text, its data is returned. */
async function run<R extends { data: unknown; error: AuthError | null }>(fn: (c: SupabaseClient) => Promise<R>): Promise<Extract<R, { error: null }>["data"]> {
  let res: R;
  try {
    res = await fn(await client());
  } catch (e) {
    throw new Error(message(e as Error));
  }
  if (res.error) throw new Error(message(res.error));
  return res.data as Extract<R, { error: null }>["data"];
}

/** Returns "confirm" when the server wants the address confirmed first (a letter is on its way). */
export async function signUp(name: string, email: string, password: string): Promise<"signedIn" | "confirm"> {
  const data = await run((c) => c.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirectUrl() } }));
  // With confirmations on, an address that already has an account gets a stand-in user without identities.
  if (data.user && !data.session && data.user.identities?.length === 0) throw new Error("Этот адрес уже зарегистрирован — войдите");
  return data.session ? "signedIn" : "confirm";
}

export async function signIn(email: string, password: string): Promise<void> {
  await run((c) => c.auth.signInWithPassword({ email, password }));
}

export async function signOut(): Promise<void> {
  await syncNow().catch(() => undefined);
  const c = await client();
  await c.auth.signOut();
  apply(null);
}

export async function updateName(name: string): Promise<void> {
  const data = await run((c) => c.auth.updateUser({ data: { name } }));
  if (data.user) useIdentity.setState({ user: toUser(data.user) });
}

export async function sendPasswordReset(email: string): Promise<void> {
  await run((c) => c.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }));
}

export async function setNewPassword(password: string): Promise<void> {
  await run((c) => c.auth.updateUser({ password }));
  useIdentity.setState({ recovery: false });
}

// ── Statistics sync ───────────────────────────────────────────────────────────────────────

interface RemoteRow {
  user_id: string;
  device_id: string;
  day: string;
  book_key: string;
  kind: ActivityRecord["kind"];
  title: string;
  author: string;
  seconds: number;
  pages: number;
  audio_seconds: number;
  finished: boolean;
  updated_at: string;
}

const toRemote = (r: ActivityRecord): RemoteRow => ({
  user_id: r.owner,
  device_id: r.deviceId,
  day: r.day,
  book_key: r.bookKey,
  kind: r.kind,
  title: r.title,
  author: r.author,
  seconds: r.seconds,
  pages: r.pages,
  audio_seconds: r.audioSeconds,
  finished: r.finished,
  updated_at: new Date(r.updatedAt).toISOString(),
});

const fromRemote = (x: RemoteRow): ActivityRecord => {
  const at = Date.parse(x.updated_at) || Date.now();
  return {
    id: rowId(x.user_id, x.device_id, x.day, x.book_key, x.kind),
    owner: x.user_id,
    deviceId: x.device_id,
    day: x.day,
    bookKey: x.book_key,
    kind: x.kind,
    title: x.title ?? "",
    author: x.author ?? "",
    seconds: x.seconds ?? 0,
    pages: x.pages ?? 0,
    audioSeconds: x.audio_seconds ?? 0,
    finished: !!x.finished,
    updatedAt: at,
    syncedAt: at,
  };
};

/** Time recorded on this device without an account becomes the account's. */
async function claimGuestRows(userId: string): Promise<void> {
  const db = getDB();
  const device = deviceId();
  await db.transaction("rw", db.activity, async () => {
    for (const g of await db.activity.where("[owner+deviceId]").equals([GUEST, device]).toArray()) {
      const id = rowId(userId, device, g.day, g.bookKey, g.kind);
      const cur = await db.activity.get(id);
      await db.activity.put({
        ...g,
        id,
        owner: userId,
        seconds: (cur?.seconds ?? 0) + g.seconds,
        pages: (cur?.pages ?? 0) + g.pages,
        audioSeconds: (cur?.audioSeconds ?? 0) + g.audioSeconds,
        finished: !!cur?.finished || g.finished,
        updatedAt: Date.now(),
        syncedAt: cur?.syncedAt,
      });
      await db.activity.delete(g.id);
    }
  });
}

async function afterSignIn(userId: string): Promise<void> {
  await flushActivity();
  await claimGuestRows(userId);
  await syncNow({ pull: true }).catch(() => undefined);
}

let syncing: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Upload soon (batched): after new statistics were written, or right away when the app is hidden. */
export function syncSoon(delay = 30_000): void {
  if (useIdentity.getState().status !== "signedIn") return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow().catch(() => undefined);
  }, delay);
}

/** Upload this device's changed rows; with `pull`, also download the other devices' rows. */
export function syncNow(opts: { pull?: boolean } = {}): Promise<void> {
  if (syncing) return syncing.then(() => syncNow(opts));
  const user = useIdentity.getState().user;
  if (!accountsEnabled || !user) return Promise.resolve();
  syncing = (async () => {
    useIdentity.setState((s) => ({ sync: { ...s.sync, state: "syncing", error: undefined } }));
    try {
      await flushActivity();
      const c = await client();
      const db = getDB();
      const device = deviceId();
      const dirty = (await db.activity.where("[owner+deviceId]").equals([user.id, device]).toArray()).filter((r) => (r.syncedAt ?? 0) < r.updatedAt);
      for (let i = 0; i < dirty.length; i += 500) {
        const chunk = dirty.slice(i, i + 500);
        const { error } = await c.from(TABLE).upsert(chunk.map(toRemote), { onConflict: CONFLICT });
        if (error) throw new Error(error.message);
        await db.transaction("rw", db.activity, async () => {
          for (const r of chunk) await db.activity.where("id").equals(r.id).modify((x) => {
            if (x.updatedAt === r.updatedAt) x.syncedAt = r.updatedAt;
          });
        });
      }
      if (opts.pull) {
        const rows: RemoteRow[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await c.from(TABLE).select("*").eq("user_id", user.id).neq("device_id", device).range(from, from + 999);
          if (error) throw new Error(error.message);
          rows.push(...((data ?? []) as RemoteRow[]));
          if (!data || data.length < 1000) break;
        }
        await db.transaction("rw", db.activity, async () => {
          const others = await db.activity.where("owner").equals(user.id).filter((r) => r.deviceId !== device).primaryKeys();
          await db.activity.bulkDelete(others);
          await db.activity.bulkPut(rows.map(fromRemote));
        });
      }
      useIdentity.setState({ sync: { state: "idle", at: Date.now() } });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      useIdentity.setState({ sync: { state: "error", at: useIdentity.getState().sync.at, error: /fetch|network/i.test(text) ? "нет связи с сервером" : text } });
      throw e;
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

/** Load the client before showing the sign-in form, so the first tap isn't slowed by the download. */
export function prepareAccount(): void {
  if (accountsEnabled) void client();
}

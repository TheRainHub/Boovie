"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookCover } from "@/components/ui/BookCover";
import { Button, IconButton, Segmented, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { GUEST, useIdentity } from "@/lib/account/identity";
import { signOut, syncNow, updateName } from "@/lib/account/session";
import { formatDuration, plural } from "@/lib/format";
import { useBooks } from "@/lib/library/hooks";
import { bookKey } from "@/lib/stats/activity";
import { summarize, type Period } from "@/lib/stats/summary";
import { getDB } from "@/lib/storage/db";
import { ActivityChart } from "./ActivityChart";
import { AuthSheet, type AuthMode } from "./AuthSheet";
import { Avatar } from "./Avatar";

function ago(at?: number): string {
  if (!at) return "";
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  return new Date(at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[18px] bg-surface p-4 ring-1 ring-line">
      <div className="text-[13.5px] font-medium text-ink-2">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-tight tracking-[-0.01em] sm:text-[30px]">{value}</div>
      {hint && <div className="mt-0.5 text-[12.5px] text-ink-3">{hint}</div>}
    </div>
  );
}

function AccountCard({ onAuth }: { onAuth: (m: AuthMode) => void }) {
  const id = useIdentity();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  if (id.status === "loading") {
    return <div className="flex h-[104px] items-center justify-center rounded-[22px] bg-surface ring-1 ring-line"><Spinner className="text-ink-2" /></div>;
  }
  if (id.status === "signedIn" && id.user) {
    const u = id.user;
    return (
      <div className="rounded-[22px] bg-surface p-4 ring-1 ring-line">
        <div className="flex items-center gap-3.5">
          <Avatar user={u} size={56} />
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await updateName(name.trim());
                    setEditing(false);
                  } catch (err) {
                    toast((err as Error).message, "error");
                  }
                }}
              >
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Имя" className="h-10 min-w-0 flex-1 rounded-[12px] bg-surface-2 px-3 text-[16px] font-semibold outline-none" />
                <Button size="sm" type="submit" disabled={!name.trim()}>Готово</Button>
              </form>
            ) : (
              <div className="truncate text-[20px] font-bold">{u.name}</div>
            )}
            <div className="truncate text-[14px] text-ink-2">{u.email}</div>
            <div className="mt-0.5 truncate text-[12.5px] text-ink-3">
              {id.sync.state === "syncing" ? "Синхронизация…" : id.sync.state === "error" ? `Не синхронизировано: ${id.sync.error}` : id.sync.at ? `Синхронизировано ${ago(id.sync.at)}` : "Статистика сохраняется в аккаунте"}
            </div>
          </div>
        </div>
        {!editing && (
          <div className="mt-3.5 flex gap-2">
            <Button className="flex-1" variant="secondary" onClick={() => { setName(u.name); setEditing(true); }}>Изменить имя</Button>
            <Button className="flex-1" variant="secondary" onClick={() => void signOut().then(() => toast("Вы вышли из аккаунта"))}>Выйти</Button>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-[22px] bg-surface p-4 ring-1 ring-line">
      <div className="flex items-center gap-3.5">
        <Avatar user={null} size={56} />
        <div className="min-w-0">
          <div className="text-[20px] font-bold">Гость</div>
          <div className="text-[14px] leading-snug text-ink-2">
            {id.status === "off" ? "Статистика хранится на этом устройстве" : "Войдите, чтобы статистика хранилась в аккаунте и собиралась со всех ваших устройств"}
          </div>
        </div>
      </div>
      {id.status === "guest" && (
        <div className="mt-3.5 flex gap-2">
          <Button className="flex-1" onClick={() => onAuth("signup")}>Создать аккаунт</Button>
          <Button className="flex-1" variant="secondary" onClick={() => onAuth("signin")}>Войти</Button>
        </div>
      )}
    </div>
  );
}

export function ProfileView() {
  const router = useRouter();
  const { status, user, recovery } = useIdentity();
  const owner = user?.id ?? GUEST;
  const [period, setPeriod] = useState<Period>("week");
  const [auth, setAuth] = useState<AuthMode | null>(null);
  const rows = useLiveQuery(() => getDB().activity.where("owner").equals(owner).toArray(), [owner]);
  const books = useBooks();
  const summary = useMemo(() => (rows ? summarize(rows, period) : null), [rows, period]);
  const covers = useMemo(() => new Map((books ?? []).map((b) => [bookKey(b), b])), [books]);

  // Fresh numbers from the other devices whenever the profile is opened.
  useEffect(() => {
    if (status === "signedIn") void syncNow({ pull: true }).catch(() => undefined);
  }, [status]);
  // Opened from a password-reset letter: ask for the new password first.
  const sheet = auth ?? (recovery ? "newPassword" : null);

  const books_ = (n: number) => `${n} ${plural(n, "книга", "книги", "книг")}`;

  return (
    <main className="mx-auto max-w-[720px] px-5 pb-10 pt-[calc(var(--sat)+10px)]">
      <header className="flex items-center gap-1">
        <IconButton label="Назад" className="-ml-2" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
          <ChevronLeft size={26} strokeWidth={2} />
        </IconButton>
        <h1 className="display text-[30px]">Профиль</h1>
        <Link href="/settings/" aria-label="Настройки" className="ml-auto flex h-10 w-10 items-center justify-center rounded-full text-ink active:bg-ink/5">
          <Settings size={22} strokeWidth={2} />
        </Link>
      </header>

      <div className="mt-4"><AccountCard onAuth={setAuth} /></div>

      <Segmented<Period>
        className="mt-6 w-full"
        layoutKey="profile-period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "week", label: "Неделя" },
          { value: "month", label: "Месяц" },
          { value: "all", label: "Всё время" },
        ]}
      />

      {!summary ? (
        <div className="flex justify-center py-16"><Spinner className="text-ink-2" /></div>
      ) : (
        <>
          <section aria-label="Итоги" className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Tile label="Слушали" value={formatDuration(summary.listenSeconds)} hint={summary.audioSeconds > summary.listenSeconds + 60 ? `${formatDuration(summary.audioSeconds)} книги с ускорением` : undefined} />
            <Tile label="Читали" value={formatDuration(summary.readSeconds)} />
            <Tile label="Страниц" value={summary.pages.toLocaleString("ru-RU")} />
            <Tile label="Прослушано" value={books_(summary.finishedListen)} />
            <Tile label="Прочитано" value={books_(summary.finishedRead)} />
            <Tile label="Дней подряд" value={String(summary.streak)} hint={period === "all" ? undefined : `${summary.activeDays} ${plural(summary.activeDays, "день", "дня", "дней")} с книгами за ${period === "week" ? "неделю" : "месяц"}`} />
          </section>

          <section className="mt-3 rounded-[22px] bg-surface p-4 ring-1 ring-line">
            <h2 className="mb-3 text-[17px] font-bold">{period === "all" ? "По месяцам" : "По дням"}</h2>
            <ActivityChart buckets={summary.buckets} unit={period === "all" ? "month" : "day"} />
          </section>

          {summary.top.length > 0 && (
            <section className="mt-3 rounded-[22px] bg-surface p-4 ring-1 ring-line">
              <h2 className="text-[17px] font-bold">Больше всего времени</h2>
              <ul className="mt-2">
                {summary.top.map((t) => {
                  const b = covers.get(t.bookKey);
                  const audio = t.bookKey.endsWith("|audio") || b?.format === "audio" || (t.listen > 0 && t.read === 0);
                  const body = (
                    <>
                      <div className={audio ? "w-[52px] shrink-0" : "w-[40px] shrink-0"}>
                        <BookCover fileId={b?.coverFileId} url={b?.coverUrl} title={t.title} author={t.author} square={audio} sizes="sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15.5px] font-semibold">{t.title}</div>
                        <div className="truncate text-[13.5px] text-ink-2">
                          {[t.listen ? `слушали ${formatDuration(t.listen)}` : null, t.read ? `читали ${formatDuration(t.read)}` : null].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </>
                  );
                  return (
                    <li key={t.bookKey} className="border-b border-line last:border-b-0">
                      {b ? (
                        <Link prefetch={false} href={`/book/?id=${b.id}`} className="flex items-center gap-3 py-2.5">{body}</Link>
                      ) : (
                        <div className="flex items-center gap-3 py-2.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      <AuthSheet
        mode={sheet}
        onMode={setAuth}
        onClose={() => {
          setAuth(null);
          useIdentity.setState({ recovery: false });
        }}
      />
    </main>
  );
}

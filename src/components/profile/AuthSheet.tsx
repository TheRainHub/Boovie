"use client";

import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button, Spinner } from "@/components/ui/primitives";
import { toast } from "@/components/ui/Toaster";
import { prepareAccount, sendPasswordReset, setNewPassword, signIn, signUp } from "@/lib/account/session";
import { t } from "@/lib/i18n";

export type AuthMode = "signin" | "signup" | "reset" | "newPassword";

const field = "h-12 w-full rounded-[14px] bg-surface-2 px-4 text-[16px] font-medium outline-none placeholder:text-ink-3 focus:ring-2 focus:ring-ink/15";

/** Sign in, create an account, ask for a reset link, or set a new password after following one. */
export function AuthSheet({ mode, onMode, onClose }: { mode: AuthMode | null; onMode: (m: AuthMode) => void; onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<null | "confirm" | "reset">(null);

  useEffect(() => {
    if (mode) prepareAccount();
  }, [mode]);
  const go = (m: AuthMode) => {
    setError(null);
    setSent(null);
    onMode(m);
  };
  const close = () => {
    setError(null);
    setSent(null);
    onClose();
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn(email.trim(), password);
        toast(t("Вы вошли"), "success");
        close();
      } else if (mode === "signup") {
        const res = await signUp(name.trim(), email.trim(), password);
        if (res === "confirm") setSent("confirm");
        else {
          toast(t("Аккаунт создан"), "success");
          close();
        }
      } else if (mode === "reset") {
        await sendPasswordReset(email.trim());
        setSent("reset");
      } else if (mode === "newPassword") {
        await setNewPassword(password);
        toast(t("Пароль изменён"), "success");
        close();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const title = { signin: t("Вход"), signup: t("Новый аккаунт"), reset: t("Сброс пароля"), newPassword: t("Новый пароль") }[mode ?? "signin"];
  const ready =
    mode === "signup" ? name.trim() && /\S+@\S+\.\S+/.test(email) && password.length >= 6
    : mode === "signin" ? /\S+@\S+\.\S+/.test(email) && password.length > 0
    : mode === "reset" ? /\S+@\S+\.\S+/.test(email)
    : password.length >= 6;

  return (
    <Sheet open={!!mode} onClose={close} title={title} widthClass="max-w-[480px]">
      <div className="px-5 pb-2">
        {sent ? (
          <div className="py-4 text-center">
            <MailCheck size={40} strokeWidth={1.6} className="mx-auto text-ink-2" />
            <p className="mt-3 text-[17px] font-semibold">{t("Проверьте почту")}</p>
            <p className="mx-auto mt-1.5 max-w-[340px] text-[15px] leading-relaxed text-ink-2">
              {sent === "confirm"
                ? t("Мы отправили письмо на {email}. Откройте ссылку из него, чтобы подтвердить адрес, затем войдите здесь.", { email: email.trim() })
                : t("Если на {email} есть аккаунт, придёт письмо со ссылкой для нового пароля.", { email: email.trim() })}
            </p>
            <Button className="mt-5" variant="secondary" onClick={() => go("signin")}>{t("Ко входу")}</Button>
          </div>
        ) : (
          <form
            className="grid gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && !busy) void submit();
            }}
          >
            {mode === "signup" && (
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t("Имя")} aria-label={t("Имя")} className={field} />
            )}
            {mode !== "newPassword" && (
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder={t("Почта")} aria-label={t("Почта")} className={field} />
            )}
            {mode !== "reset" && (
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                placeholder={mode === "signin" ? t("Пароль") : t("Пароль, не меньше 6 символов")}
                aria-label={t("Пароль")}
                className={field}
              />
            )}
            {error && <p className="px-1 text-[14px] font-medium text-[#B3261E] dark:text-[#F2B8B5]" role="alert">{error}</p>}
            <Button type="submit" size="lg" className="mt-1.5 w-full" disabled={!ready || busy}>
              {busy ? <Spinner size={20} /> : { signin: t("Войти"), signup: t("Создать аккаунт"), reset: t("Прислать ссылку"), newPassword: t("Сохранить пароль") }[mode ?? "signin"]}
            </Button>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[14.5px] font-semibold text-ink-2">
              {mode === "signin" && (
                <>
                  <button type="button" onClick={() => go("signup")}>{t("Создать аккаунт")}</button>
                  <button type="button" onClick={() => go("reset")}>{t("Забыли пароль?")}</button>
                </>
              )}
              {(mode === "signup" || mode === "reset") && <button type="button" onClick={() => go("signin")}>{t("У меня есть аккаунт")}</button>}
            </div>
            {mode === "signup" && (
              <p className="mt-1 text-center text-[12.5px] leading-snug text-ink-3">
                {t("Время, проведённое с книгами на этом устройстве до входа, перейдёт в аккаунт.")}
              </p>
            )}
          </form>
        )}
      </div>
    </Sheet>
  );
}

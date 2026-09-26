"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { I18nProvider, useI18n } from "@/hooks/useI18n";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

function safeDestination(): string {
  const destination = new URLSearchParams(window.location.search).get("next");
  return destination?.startsWith("/") && !destination.startsWith("//") ? destination : "/";
}

function LoginForm() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/web-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? t("auth.invalidPassword") : t("auth.loginFailed"));
        return;
      }
      window.location.replace(safeDestination());
    } catch {
      setError(t("auth.loginFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-full place-items-center bg-background p-6 pt-[max(24px,env(safe-area-inset-top))] pr-[max(20px,env(safe-area-inset-right))] pb-[max(24px,env(safe-area-inset-bottom))] pl-[max(20px,env(safe-area-inset-left))]">
      <div className="w-full max-w-[360px]">
        <header className="mb-[22px] flex items-center gap-3.5">
          <Image src="/icons/apple-touch-icon.png" width={52} height={52} alt="" priority className="shrink-0 rounded-lg" />
          <p className="m-0 text-xs text-muted-foreground">{t("auth.prompt")}</p>
        </header>
        <form className="w-full" onSubmit={submit}>
          <Field
            orientation="horizontal"
            className="min-w-0 gap-2 rounded-[14px] border border-border/70 bg-background py-2.5 pr-2.5 pl-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] transition-[border-color,box-shadow] focus-within:border-primary focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_14%,transparent),0_8px_24px_-12px_rgba(15,23,42,0.10)]"
          >
            <FieldLabel htmlFor="web-login-password" className="sr-only">{t("auth.password")}</FieldLabel>
            <Input
              id="web-login-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("auth.password")}
              autoComplete="current-password"
              autoFocus
              required
              disabled={busy}
              className="h-[30px] flex-1 border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button type="submit" disabled={busy || !password} size="sm" className="shrink-0 gap-1.5 rounded-lg">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="2" y1="7" x2="11" y2="7" />
                <polyline points="7.5 3 12 7 7.5 11" />
              </svg>
              {busy ? t("auth.loggingIn") : t("auth.logIn")}
            </Button>
          </Field>
          <p className="mx-1 mt-[7px] min-h-[17px] text-[11px] leading-[17px] text-destructive" role="alert" aria-live="polite">{error}</p>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return <I18nProvider><LoginForm /></I18nProvider>;
}

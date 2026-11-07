import { useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useI18n } from "@/lib/i18n";
import { bootstrapStatus, lookupLogin, requestPasswordHelp } from "@/lib/server/api";
import { BootScreen } from "@/components/app-shell";
import { Button, Field } from "@/components/ui";

export const Route = createFileRoute("/login")({ component: LoginPage });

const BEARER_KEY = "grok-auth.bearer-token";

async function authPost(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const token = response.headers.get("set-auth-token");
  if (token) window.sessionStorage.setItem(BEARER_KEY, token);
  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(payload.message || "INVALID_LOGIN");
  await authClient.getSession();
}

function LoginPage() {
  const { user, isPending } = useCurrentUserState();
  const { t, lang, setLang } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: () => bootstrapStatus() });
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  if (isPending) return <BootScreen />;
  if (user) return <Navigate to="/" />;

  async function submit() {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      if (mode === "forgot") {
        await requestPasswordHelp({ data: { email: identifier } });
        setInfo(t("login.forgotSent"));
        return;
      }
      if (mode === "up") {
        await authPost("/api/auth/sign-up/email", { email: identifier.trim().toLowerCase(), password, name });
        window.location.assign("/");
        return;
      }
      const lookup = await lookupLogin({ data: { identifier } });
      if (!lookup.email) throw new Error("INVALID_LOGIN");
      await authPost("/api/auth/sign-in/email", { email: lookup.email, password });
      window.location.assign("/");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "INVALID_LOGIN";
      setError(message === "INVALID_LOGIN" ? t("err.INVALID_LOGIN") : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-navy text-lg font-semibold text-paper">N</div>
            <div>
              <p className="text-2xl font-semibold">{t("app.name")}</p>
              <p className="text-sm text-slate">{t("app.tag")}</p>
            </div>
          </div>
          <button type="button" className="h-11 rounded-xl px-3 text-sm font-semibold text-teal" onClick={() => setLang(lang === "en" ? "ur" : "en")}>
            {lang === "en" ? "اردو" : "EN"}
          </button>
        </div>
        <section className="space-y-4 rounded-2xl border border-line bg-paper p-5 shadow-card">
          <h1 className="text-xl font-semibold">{mode === "up" ? t("action.createAdmin") : mode === "forgot" ? t("login.forgot") : t("login.title")}</h1>
          <p className="text-sm text-slate">{mode === "forgot" ? t("login.forgotLead") : boot.data?.open ? t("login.bootstrap") : t("login.lead")}</p>
          {mode === "up" ? <Field label={t("login.name")} value={name} onChange={setName} /> : null}
          <Field label={mode === "in" ? t("login.email") : "Email"} value={identifier} onChange={setIdentifier} />
          {mode !== "forgot" ? <Field label={t("login.password")} type="password" value={password} onChange={setPassword} /> : null}
          {mode !== "forgot" ? <p className="text-xs text-slate">{t("login.passwordHint")}</p> : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          {info ? <p className="text-sm text-teal">{info}</p> : null}
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {mode === "up" ? t("action.createAdmin") : mode === "forgot" ? t("login.forgot") : t("action.signIn")}
          </Button>
          <div className="flex flex-wrap gap-2">
            {mode !== "forgot" ? <Button tone="ghost" onClick={() => setMode("forgot")}>{t("login.forgot")}</Button> : <Button tone="ghost" onClick={() => setMode("in")}>{t("action.signIn")}</Button>}
            {boot.data?.open && mode !== "up" ? <Button tone="ghost" onClick={() => setMode("up")}>{t("action.createAdmin")}</Button> : null}
          </div>
          {mode === "in" ? (
            <div className="space-y-2 border-t border-line pt-4">
              <p className="text-xs text-slate">{t("login.or")}</p>
              {GROK_PROVIDERS.map((provider) => (
                <Button key={provider.providerId} tone="quiet" className="w-full" onClick={() => void signIn(provider.providerId, { callbackURL: "/" })}>
                  {provider.label}
                </Button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

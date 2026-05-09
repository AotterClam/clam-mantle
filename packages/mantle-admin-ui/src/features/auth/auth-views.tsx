import * as React from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "../../ui/button";
import { usePreferences } from "../../app/preferences";
import { t } from "../../app/i18n";

export function GateLoading(): React.ReactElement {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card w-full max-w-sm p-6">
        <div className="mb-4 h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

export function GateError({ error }: { error: unknown }): React.ReactElement {
  const { language } = usePreferences();
  const message = error instanceof Error ? error.message : "Unknown error.";
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-sm p-8 text-center">
        <h1 className="mb-2 text-xl">{t(language, "auth.error.title")}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

export function AccessDeniedView({
  login,
}: {
  login: string | null;
}): React.ReactElement {
  const { language } = usePreferences();
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="mb-2 text-xl">{t(language, "auth.accessDenied.title")}</h1>
        {login ? (
          <p className="mb-1 text-sm font-medium text-foreground">
            GitHub: {login}
          </p>
        ) : null}
        <p className="mb-1 text-sm text-muted-foreground">
          {t(language, "auth.accessDenied.noStaff")}
        </p>
        <p className="mb-6 text-sm text-muted-foreground">
          {t(language, "auth.accessDenied.askOwner")}
        </p>
        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="me-2 size-4" aria-hidden />
          {t(language, "common.signOut")}
        </Button>
      </div>
    </div>
  );
}

export function SignInView(): React.ReactElement {
  const { language } = usePreferences();
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("return") ?? "/admin";

  // Better Auth (ADR-0014): POST /api/auth/sign-in/social returns
  // { url, redirect: true }; the SPA navigates to the GitHub
  // authorize URL, GitHub bounces back to the OAuth callback (handled
  // by Better Auth via the starter's translator route), Better Auth
  // sets a session cookie, then 302s back to `callbackURL`.
  const startGitHub = async (): Promise<void> => {
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: ret }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { url?: string; redirect?: boolean };
    if (data.url) window.location.href = data.url;
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-sm p-8">
        <p className="label-eyebrow mb-2">{t(language, "auth.signIn.eyebrow")}</p>
        <h1 className="mb-2 text-xl">{t(language, "auth.signIn.title")}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          {t(language, "auth.signIn.body")}
        </p>
        <Button onClick={() => void startGitHub()} className="w-full">
          {t(language, "auth.signIn.github")}
        </Button>
      </div>
    </div>
  );
}

// Better Auth (ADR-0014): POST /api/auth/sign-out clears the session
// cookie and returns 200. The SPA then bounces to the sign-in view.
function signOut(): void {
  void fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  }).then(() => {
    window.location.href = "/admin/sign-in";
  });
}

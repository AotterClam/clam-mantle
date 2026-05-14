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

type AuthMethodKind = "github" | "email-otp";

interface MethodsResponse {
  methods: AuthMethodKind[];
}

/**
 * Data-driven sign-in. Fetches `/api/auth/methods` on mount; renders
 * one section per registered method. When `email-otp` is present, a
 * two-step inline form (email → OTP). When `github` is present, a
 * social button.
 *
 * Method labels come from `auth.signIn.method.<kind>.*` i18n keys. The
 * fallback chain is: current language → English → key. Adding a new
 * method (passkey, google) is a new union case + new i18n keys.
 */
export function SignInView(): React.ReactElement {
  const { language } = usePreferences();
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("return") ?? "/admin";

  const [methods, setMethods] = React.useState<AuthMethodKind[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/methods", { credentials: "include" })
      .then((res) => res.ok ? res.json() as Promise<MethodsResponse> : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data) => {
        if (cancelled) return;
        setMethods(data.methods ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-sm p-8">
        <p className="label-eyebrow mb-2">{t(language, "auth.signIn.eyebrow")}</p>
        <h1 className="mb-2 text-xl">{t(language, "auth.signIn.title")}</h1>

        {error ? (
          <p className="mb-4 text-sm text-destructive">
            {t(language, "auth.signIn.methodsLoadFailed")}
          </p>
        ) : null}
        {methods === null && !error ? (
          <div className="space-y-2">
            <div className="h-9 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : null}
        {methods && methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(language, "auth.signIn.noMethods")}
          </p>
        ) : null}
        {methods?.map((kind, idx) => (
          <MethodSection
            key={kind}
            kind={kind}
            returnTo={ret}
            isFirst={idx === 0}
          />
        ))}
      </div>
    </div>
  );
}

function MethodSection({
  kind,
  returnTo,
  isFirst,
}: {
  kind: AuthMethodKind;
  returnTo: string;
  isFirst: boolean;
}): React.ReactElement {
  if (kind === "github") {
    return <GitHubSignInSection returnTo={returnTo} isFirst={isFirst} />;
  }
  if (kind === "email-otp") {
    return <EmailOtpSection isFirst={isFirst} />;
  }
  return <UnknownMethodSection kind={kind} />;
}

function GitHubSignInSection({
  returnTo,
  isFirst,
}: {
  returnTo: string;
  isFirst: boolean;
}): React.ReactElement {
  const { language } = usePreferences();
  const startGitHub = async (): Promise<void> => {
    const res = await fetch("/api/auth/sign-in/social", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: returnTo }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { url?: string };
    if (data.url) window.location.href = data.url;
  };
  return (
    <div className={isFirst ? "" : "mt-4"}>
      <Button onClick={() => void startGitHub()} className="w-full">
        {t(language, "auth.signIn.method.github.button")}
      </Button>
    </div>
  );
}

function EmailOtpSection({ isFirst }: { isFirst: boolean }): React.ReactElement {
  const { language } = usePreferences();
  const [step, setStep] = React.useState<"email" | "otp">("email");
  const [email, setEmail] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sendOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type: "sign-in" }),
      });
      if (!res.ok) {
        setError(t(language, "auth.signIn.method.email-otp.sendFailed"));
        return;
      }
      setStep("otp");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!otp) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/sign-in/email-otp", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      if (!res.ok) {
        setError(t(language, "auth.signIn.method.email-otp.verifyFailed"));
        return;
      }
      // Better Auth sets the session cookie on the response; reload
      // to let the gate redirect to the original return URL.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className={isFirst ? "" : "mt-6 border-t border-border pt-4"}>
      <p className="mb-2 text-sm text-muted-foreground">
        {t(language, "auth.signIn.method.email-otp.body")}
      </p>
      {step === "email" ? (
        <form onSubmit={(e) => void sendOtp(e)} className="space-y-2">
          <label htmlFor="signin-email" className="sr-only">
            {t(language, "auth.signIn.method.email-otp.emailLabel")}
          </label>
          <input
            id="signin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            placeholder={t(language, "auth.signIn.method.email-otp.emailPlaceholder")}
            required
            autoComplete="email"
            className={inputClass}
          />
          <Button type="submit" className="w-full" disabled={busy || !email}>
            {t(language, "auth.signIn.method.email-otp.sendButton")}
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => void verifyOtp(e)} className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t(language, "auth.signIn.method.email-otp.sentTo", { email })}
          </p>
          <label htmlFor="signin-otp" className="sr-only">
            {t(language, "auth.signIn.method.email-otp.otpLabel")}
          </label>
          <input
            id="signin-otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.currentTarget.value)}
            placeholder={t(language, "auth.signIn.method.email-otp.otpPlaceholder")}
            required
            className={inputClass}
          />
          <Button type="submit" className="w-full" disabled={busy || !otp}>
            {t(language, "auth.signIn.method.email-otp.verifyButton")}
          </Button>
          <button
            type="button"
            onClick={() => setStep("email")}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {t(language, "auth.signIn.method.email-otp.back")}
          </button>
        </form>
      )}
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function UnknownMethodSection({ kind }: { kind: string }): React.ReactElement {
  const { language } = usePreferences();
  return (
    <p className="mt-4 text-xs text-muted-foreground">
      {t(language, "auth.signIn.unknownMethod", { kind })}
    </p>
  );
}

function signOut(): void {
  void fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  }).then(() => {
    window.location.href = "/admin/sign-in";
  });
}

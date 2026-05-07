import * as React from "react";
import { AlertTriangle, LogOut } from "lucide-react";
import { Button } from "../../ui/button";

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
  const message = error instanceof Error ? error.message : "Unknown error.";
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-sm p-8 text-center">
        <h1 className="mb-2 text-xl">Something went wrong</h1>
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
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-3 inline-flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" aria-hidden />
        </div>
        <h1 className="mb-2 text-xl">Access denied</h1>
        <p className="mb-1 text-sm text-muted-foreground">
          {login ? (
            <>
              You're signed in as <span className="font-medium text-foreground">{login}</span>,
              but this account isn't on the admin staff list.
            </>
          ) : (
            <>You're signed in, but this account isn't on the admin staff list.</>
          )}
        </p>
        <p className="mb-6 text-sm text-muted-foreground">
          Ask a site owner to add your GitHub login, or sign out to try a
          different account.
        </p>
        <Button variant="outline" className="w-full" onClick={signOut}>
          <LogOut className="me-2 size-4" aria-hidden />
          Sign out
        </Button>
      </div>
    </div>
  );
}

export function SignInView(): React.ReactElement {
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("return") ?? "/admin";
  const href = `/admin/auth/github?return_to=${encodeURIComponent(ret)}`;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-sm p-8">
        <p className="label-eyebrow mb-2">Clam CMS admin</p>
        <h1 className="mb-2 text-xl">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          GitHub OAuth keeps this console limited to your staff list.
        </p>
        <Button asChild className="w-full">
          <a href={href}>Continue with GitHub</a>
        </Button>
      </div>
    </div>
  );
}

function signOut(): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/admin/logout";
  document.body.appendChild(form);
  form.submit();
}

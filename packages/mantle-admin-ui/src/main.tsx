import { StrictMode, useEffect } from "react";
import * as React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { AuthenticatedLayout } from "./layout/authenticated-layout";
import { api, ApiError } from "./lib/api";
import type { Collection, EntryRow, ListEntriesResult } from "./lib/types";
import { Button } from "./ui/button";
import "./styles/index.css";

/**
 * Pre-built ICU formatter for entry-row timestamps. Construction is
 * the expensive part of `Intl.DateTimeFormat`; one instance reused
 * across every row beats `new Date(ms).toLocaleString()` per render.
 */
const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

/**
 * Admin SPA entrypoint. Path-based view selection — no router lib.
 * The platform adapter's catchall returns the same index.html for
 * every URL under /admin/*; we read window.location.pathname and
 * pick a view.
 *
 * View map:
 *   /admin/sign-in         → <SignInView/>           (no shell)
 *   /admin/c/<collection>  → <CollectionView/>       (in shell)
 *   /admin                 → <HomeView/>             (in shell)
 *   anything else under /admin → <NotFoundView/>     (in shell)
 *
 * 401 from /admin/api/me triggers a redirect to /admin/sign-in. The
 * server-side gate already does this for HTML requests, so this fires
 * on race conditions only (session expired between page load and
 * first /me fetch).
 */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && [401, 403].includes(error.status)) {
          return false;
        }
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

function App(): React.ReactElement {
  const path =
    typeof window !== "undefined" ? window.location.pathname : "/admin";

  if (path === "/admin/sign-in") {
    return <SignInView />;
  }

  const collectionMatch = path.match(/^\/admin\/c\/([^/]+)\/?$/);
  if (collectionMatch) {
    return (
      <AuthenticatedLayout>
        <CollectionView collectionName={collectionMatch[1]!} />
      </AuthenticatedLayout>
    );
  }

  if (path === "/admin" || path === "/admin/") {
    return (
      <AuthenticatedLayout>
        <HomeView />
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <NotFoundView path={path} />
    </AuthenticatedLayout>
  );
}

function SignInView(): React.ReactElement {
  const params = new URLSearchParams(window.location.search);
  const ret = params.get("return") ?? "/admin";
  const href = `/admin/auth/github?return_to=${encodeURIComponent(ret)}`;

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="glass-card animate-rise w-full max-w-sm p-8">
        <h1 className="mb-2 text-xl">Sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          GitHub OAuth — only allow-listed accounts may access this admin.
        </p>
        <Button asChild className="w-full">
          <a href={href}>Continue with GitHub</a>
        </Button>
      </div>
    </div>
  );
}

function HomeView(): React.ReactElement {
  const collectionsQuery = useQuery<Collection[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await api.get<{ collections: Collection[] }>("/collections");
      return res.collections;
    },
  });
  const collections = collectionsQuery.data ?? [];

  return (
    <div>
      <h1 className="mb-2 text-2xl">Welcome</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Pick a collection to begin.
      </p>

      {collectionsQuery.isLoading && (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      )}
      {collectionsQuery.isError && (
        <ErrorBox error={collectionsQuery.error} />
      )}
      {collectionsQuery.data && collections.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No collections defined yet.
        </div>
      )}
      {collections.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {collections.map((c) => (
            <a
              key={c.name}
              href={`/admin/c/${c.name}`}
              className="glass-card card-lift block p-5 no-underline text-foreground"
            >
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-lg">{c.title}</h2>
                <span className="label-eyebrow">{c.lifecycle}</span>
              </div>
              {c.description && (
                <p className="text-sm text-muted-foreground">
                  {c.description}
                </p>
              )}
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                {c.name}
              </p>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function CollectionView({
  collectionName,
}: {
  collectionName: string;
}): React.ReactElement {
  const status =
    new URLSearchParams(window.location.search).get("status") ?? undefined;

  const collectionsQuery = useQuery<Collection[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await api.get<{ collections: Collection[] }>("/collections");
      return res.collections;
    },
  });
  const entries = useQuery<ListEntriesResult>({
    queryKey: ["entries", collectionName, status ?? "all"],
    queryFn: () => {
      const qs = new URLSearchParams({ collection: collectionName });
      if (status) qs.set("status", status);
      return api.get<ListEntriesResult>(`/entries?${qs.toString()}`);
    },
  });

  const collection = collectionsQuery.data?.find(
    (c) => c.name === collectionName,
  );
  const heading = collection?.title ?? collectionName;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="label-eyebrow mb-1">
            <a href="/admin" className="hover:underline">
              Entries
            </a>
            <span className="mx-2 text-foreground/30">/</span>
            <span className="text-foreground/70">{collectionName}</span>
          </p>
          <h1 className="text-2xl">{heading}</h1>
          {collection?.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {collection.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <span className="badge-status bg-[color-mix(in_srgb,var(--info)_18%,transparent)] text-[color:var(--info)]">
              {status}
            </span>
          )}
          {collection?.localized && (
            <span className="badge-status bg-accent text-accent-foreground">
              localized
            </span>
          )}
        </div>
      </div>

      {entries.isLoading && (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          Loading entries…
        </div>
      )}
      {entries.isError && <ErrorBox error={entries.error} />}
      {entries.data && entries.data.items.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No entries{status ? ` with status "${status}"` : ""} yet.
        </div>
      )}
      {entries.data && entries.data.items.length > 0 && (
        <div className="glass-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="border-b border-[var(--glass-border)]">
                <th className="label-eyebrow px-3 py-2">ID</th>
                <th className="label-eyebrow px-3 py-2">Title</th>
                <th className="label-eyebrow px-3 py-2">Status</th>
                <th className="label-eyebrow px-3 py-2">Locale</th>
                <th className="label-eyebrow px-3 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {entries.data.items.map((row) => (
                <EntryRowDisplay key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function EntryRowDisplay({ row }: { row: EntryRow }): React.ReactElement {
  return (
    <tr className="border-t border-[var(--glass-border)] hover:bg-accent/40">
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
        {String(row.id).slice(0, 8)}
      </td>
      <td className="px-3 py-2">{renderTitle(row.title)}</td>
      <td className="px-3 py-2">
        <span className="badge-status bg-accent text-accent-foreground">
          {row.status}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{row.locale ?? "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">
        {formatTimestamp(row.updated_at)}
      </td>
    </tr>
  );
}

function renderTitle(title: unknown): React.ReactNode {
  if (title == null || title === "") {
    return <span className="text-muted-foreground">(untitled)</span>;
  }
  if (typeof title === "string") return title;
  return <span className="font-mono text-xs">{JSON.stringify(title)}</span>;
}

function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  try {
    return TIMESTAMP_FMT.format(new Date(ms));
  } catch {
    return "—";
  }
}

function ErrorBox({ error }: { error: unknown }): React.ReactElement | null {
  const is401 = error instanceof ApiError && error.status === 401;
  // Side-effect (full-page nav) MUST live in an effect — inline during
  // render trips StrictMode and may dispatch the navigation more than
  // once if the parent re-renders before unmount.
  useEffect(() => {
    if (!is401 || typeof window === "undefined") return;
    const ret = window.location.pathname + window.location.search;
    window.location.href = `/admin/sign-in?return=${encodeURIComponent(ret)}`;
  }, [is401]);
  if (is401) return null;
  const message =
    error instanceof Error ? error.message : "Unknown error.";
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
      Failed to load: {message}
    </div>
  );
}

function NotFoundView({ path }: { path: string }): React.ReactElement {
  return (
    <div className="glass-card animate-rise mx-auto max-w-md p-8 text-center">
      <h1 className="mb-2 text-xl">Not found</h1>
      <p className="text-sm text-muted-foreground">
        No view registered for{" "}
        <code className="font-mono text-xs">{path}</code>.
      </p>
      <p className="mt-4 text-sm">
        <a href="/admin" className="text-primary hover:underline">
          Back to home
        </a>
      </p>
    </div>
  );
}

const rootElement = document.getElementById("root")!;
ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

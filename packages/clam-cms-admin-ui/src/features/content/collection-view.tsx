import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useAdminLocation } from "../../app/router";
import { api } from "../../lib/api";
import type { Collection, EntryRow, ListEntriesResult } from "../../lib/types";
import { cn } from "../../lib/utils";
import { TableCell, TableHeadCell, TableShell } from "../../ui/admin-table";
import { EmptyState, ErrorBox, PageHeader } from "../../ui/page";
import { StatusBadge } from "../../ui/status-badge";
import { STATUS_LABELS } from "./status";

const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

export function CollectionView({
  collectionName,
}: {
  collectionName: string;
}): React.ReactElement {
  const location = useAdminLocation();
  const status = new URLSearchParams(location.search).get("status") ?? undefined;

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

  const collection = collectionsQuery.data?.find((c) => c.name === collectionName);
  const heading = collection?.title ?? collectionName;

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <a href="/admin" className="hover:underline">
              Collections
            </a>
            <span className="mx-2 text-foreground/30">/</span>
            <span className="text-foreground/70">{collectionName}</span>
          </>
        }
        title={heading}
        description={collection?.description ?? "Entries in this collection."}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status ? <StatusBadge status={status} /> : null}
            {collection?.hasTranslations ? (
              <span className="badge-status bg-accent text-accent-foreground">i18n</span>
            ) : null}
          </div>
        }
      />

      {collection ? (
        <StatusFilter collection={collection} activeStatus={status} />
      ) : null}

      {entries.isLoading && <EntriesSkeleton />}
      {entries.isError && <ErrorBox error={entries.error} />}
      {entries.data && entries.data.items.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No entries yet"
          description={status ? `No ${status} entries in this collection.` : "This collection has no entries yet."}
        />
      )}
      {entries.data && entries.data.items.length > 0 && (
        <>
          <TableShell>
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <TableHeadCell>ID</TableHeadCell>
                <TableHeadCell>Title</TableHeadCell>
                <TableHeadCell>Status</TableHeadCell>
                <TableHeadCell>Locale</TableHeadCell>
                <TableHeadCell>Version</TableHeadCell>
                <TableHeadCell>Updated</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {entries.data.items.map((row) => (
                <EntryRowDisplay key={row.id} row={row} />
              ))}
            </tbody>
          </TableShell>
          {entries.data.next_cursor ? (
            <p className="mt-3 text-xs text-muted-foreground">
              More rows are available, but cursor pagination is not wired in this admin shell yet.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function StatusFilter({
  collection,
  activeStatus,
}: {
  collection: Collection;
  activeStatus: string | undefined;
}): React.ReactElement {
  const statuses = collection.lifecycle === "editorial"
    ? (["draft", "review", "published", "archived"] as const)
    : (["draft", "published", "archived"] as const);

  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      <StatusFilterLink
        href={`/admin/c/${encodeURIComponent(collection.name)}`}
        active={!activeStatus}
      >
        All
      </StatusFilterLink>
      {statuses.map((s) => (
        <StatusFilterLink
          key={s}
          href={`/admin/c/${encodeURIComponent(collection.name)}?status=${s}`}
          active={activeStatus === s}
        >
          {STATUS_LABELS[s]}
        </StatusFilterLink>
      ))}
    </div>
  );
}

function StatusFilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-medium",
        "transition-colors duration-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        active
          ? "border-[var(--glass-border)] bg-secondary text-secondary-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {children}
    </a>
  );
}

function EntriesSkeleton(): React.ReactElement {
  return (
    <div className="glass-card overflow-hidden">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-[var(--glass-border)] p-3 last:border-b-0"
        >
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-3 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EntryRowDisplay({ row }: { row: EntryRow }): React.ReactElement {
  return (
    <tr className="border-t border-[var(--glass-border)] hover:bg-accent/40">
      <TableCell className="font-mono text-xs text-muted-foreground">
        {String(row.id).slice(0, 8)}
      </TableCell>
      <TableCell className="max-w-[24rem] truncate">{renderTitle(row.title)}</TableCell>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="text-muted-foreground">{row.locale ?? "-"}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        v{row.version}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatTimestamp(row.updated_at)}
      </TableCell>
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
  if (!Number.isFinite(ms)) return "-";
  try {
    return TIMESTAMP_FMT.format(new Date(ms));
  } catch {
    return "-";
  }
}

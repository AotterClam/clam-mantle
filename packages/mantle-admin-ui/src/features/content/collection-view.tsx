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
import { statusLabel } from "./status";
import { usePreferences, type AdminLanguage } from "../../app/preferences";
import { t } from "../../app/i18n";

const TIMESTAMP_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short",
});

export function CollectionView({
  collectionName,
}: {
  collectionName: string;
}): React.ReactElement {
  const { language } = usePreferences();
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
              {t(language, "collection.breadcrumb")}
            </a>
            <span className="mx-2 text-foreground/30">/</span>
            <span className="text-foreground/70">{collectionName}</span>
          </>
        }
        title={heading}
        description={collection?.description ?? t(language, "collection.defaultDescription")}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status ? <StatusBadge status={status} /> : null}
            {collection?.hasTranslations ? (
              <span className="badge-status bg-accent text-accent-foreground">i18n</span>
            ) : null}
            {collection?.mediaFields?.length ? (
              <span className="badge-status bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[color:var(--success)]">
                media
              </span>
            ) : null}
          </div>
        }
      />

      {collection ? (
        <StatusFilter
          collection={collection}
          activeStatus={status}
          language={language}
        />
      ) : null}

      {entries.isLoading && <EntriesSkeleton />}
      {entries.isError && <ErrorBox error={entries.error} />}
      {entries.data && entries.data.items.length === 0 && (
        <EmptyState
          icon={FileText}
          title={t(language, "collection.empty.title")}
          description={
            status
              ? t(language, "collection.empty.withStatus", { status })
              : t(language, "collection.empty.all")
          }
        />
      )}
      {entries.data && entries.data.items.length > 0 && (
        <>
          <TableShell>
            <thead>
              <tr className="border-b border-[var(--glass-border)]">
                <TableHeadCell>{t(language, "collection.table.id")}</TableHeadCell>
                <TableHeadCell>{t(language, "collection.table.title")}</TableHeadCell>
                <TableHeadCell>{t(language, "collection.table.status")}</TableHeadCell>
                <TableHeadCell>{t(language, "collection.table.locale")}</TableHeadCell>
                <TableHeadCell>{t(language, "collection.table.version")}</TableHeadCell>
                <TableHeadCell>{t(language, "collection.table.updated")}</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {entries.data.items.map((row) => (
                <EntryRowDisplay key={row.id} row={row} language={language} />
              ))}
            </tbody>
          </TableShell>
          {entries.data.next_cursor ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {t(language, "collection.moreRows")}
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
  language,
}: {
  collection: Collection;
  activeStatus: string | undefined;
  language: AdminLanguage;
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
        {t(language, "collection.filter.all")}
      </StatusFilterLink>
      {statuses.map((s) => (
        <StatusFilterLink
          key={s}
          href={`/admin/c/${encodeURIComponent(collection.name)}?status=${s}`}
          active={activeStatus === s}
        >
          {statusLabel(language, s)}
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

function EntryRowDisplay({
  row,
  language,
}: {
  row: EntryRow;
  language: AdminLanguage;
}): React.ReactElement {
  return (
    <tr className="border-t border-[var(--glass-border)] hover:bg-accent/40">
      <TableCell className="font-mono text-xs text-muted-foreground">
        {String(row.id).slice(0, 8)}
      </TableCell>
      <TableCell className="max-w-[24rem] truncate">
        {renderTitle(row.title, language)}
      </TableCell>
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

function renderTitle(
  title: unknown,
  language: AdminLanguage,
): React.ReactNode {
  if (title == null || title === "") {
    return (
      <span className="text-muted-foreground">
        {t(language, "collection.untitled")}
      </span>
    );
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

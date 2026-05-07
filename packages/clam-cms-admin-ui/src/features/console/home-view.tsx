import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Database, FileText, Globe, PlugZap } from "lucide-react";
import { api } from "../../lib/api";
import type { Collection, SiteInfo } from "../../lib/types";
import { Button } from "../../ui/button";
import { CopyField, EmptyState, ErrorBox, PageHeader, SectionCard } from "../../ui/page";
import { STATUS_LABELS } from "../content/status";

export function HomeView(): React.ReactElement {
  const site = useQuery<SiteInfo>({
    queryKey: ["site"],
    queryFn: () => api.get<SiteInfo>("/site"),
  });
  const collectionsQuery = useQuery<Collection[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await api.get<{ collections: Collection[] }>("/collections");
      return res.collections;
    },
  });
  const collections = collectionsQuery.data ?? [];
  const siteInfo = site.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Owner console"
        title={siteInfo?.brand ?? "Clam CMS"}
        description={
          siteInfo
            ? `${siteInfo.title} is deployed. Use this console for orientation; use an MCP-capable agent for content operations.`
            : "Use this console for orientation; use an MCP-capable agent for content operations."
        }
        actions={
          siteInfo?.publicUrl ? (
            <Button asChild variant="outline">
              <a href={siteInfo.publicUrl} target="_blank" rel="noreferrer">
                <Globe className="size-4" aria-hidden />
                View site
              </a>
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <SectionCard>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-primary/15 p-2 text-primary">
              <Bot className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg">Next: connect an agent</h2>
              <p className="text-sm text-muted-foreground">
                Give this MCP URL to Claude Code, Codex, Cursor, or another MCP
                client. It will open a consent screen, then the agent can manage
                this site's content with your staff permission.
              </p>
            </div>
          </div>
          {site.isLoading ? (
            <div className="space-y-3">
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : site.isError ? (
            <ErrorBox error={site.error} />
          ) : siteInfo ? (
            <div className="grid gap-3">
              <CopyField label="MCP URL" value={siteInfo.mcpUrl} />
              <CopyField label="Public URL" value={siteInfo.publicUrl} href={siteInfo.publicUrl} />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard>
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-xl bg-accent p-2 text-accent-foreground">
              <PlugZap className="size-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg">Operational loop</h2>
              <p className="text-sm text-muted-foreground">
                Ask your content agent to list entries, create drafts, publish,
                unpublish, or adjust copy. Then refresh this console if you want
                a human-readable inventory.
              </p>
            </div>
          </div>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2"><span className="text-primary">1.</span>Open the public site and inspect the result.</li>
            <li className="flex gap-2"><span className="text-primary">2.</span>Connect a second agent through MCP.</li>
            <li className="flex gap-2"><span className="text-primary">3.</span>Tell the agent what content or workflow to change.</li>
          </ol>
        </SectionCard>
      </div>

      <section>
        <PageHeader
          eyebrow="Content model"
          title="Collections"
          description="These collections come from your 4-atom manifest set. Translation child schemas are folded into their parent."
        />

        {collectionsQuery.isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="glass-card h-36 animate-pulse" />
            ))}
          </div>
        )}
        {collectionsQuery.isError && <ErrorBox error={collectionsQuery.error} />}
        {collectionsQuery.data && collections.length === 0 && (
          <EmptyState
            icon={Database}
            title="No collections defined yet"
            description="A blank project can add Schema manifests later; a starter should normally seed at least one collection."
          />
        )}
        {collections.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((c) => (
              <a
                key={c.name}
                href={`/admin/c/${encodeURIComponent(c.name)}`}
                className="glass-card card-lift block p-5 no-underline text-foreground"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg">{c.title}</h2>
                    <p className="font-mono text-xs text-muted-foreground">{c.name}</p>
                  </div>
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                {c.description ? (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No description.</p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="badge-status bg-accent text-accent-foreground">{c.lifecycle}</span>
                  {c.hasTranslations ? (
                    <span className="badge-status bg-[color-mix(in_srgb,var(--info)_16%,transparent)] text-[color:var(--info)]">
                      i18n
                    </span>
                  ) : null}
                  <span className="badge-status bg-muted text-muted-foreground">
                    {STATUS_LABELS.published}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

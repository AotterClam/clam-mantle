import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardList,
  Folder,
  Globe,
  Home,
  Settings as SettingsIcon,
} from "lucide-react";

import { ProfileMenu } from "./profile-menu";
import { api } from "./lib/api";
import {
  EDITORIAL_STATUSES,
  SIMPLE_STATUSES,
  type AdminUser,
  type Collection,
  type SidebarStatus,
} from "./lib/types";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "./ui/sidebar";

/**
 * AdminShell — admin chrome (sidebar + header + footer) wrapping the
 * page-specific view passed in as `children`.
 *
 * Data sourcing:
 *   - `me` query → /admin/api/me → ProfileMenu (login + role).
 *   - `collections` query → /admin/api/collections → sidebar nav.
 *   - `pathname` / `activeStatus` → derived from window.location.
 *
 * Sidebar's per-Schema lifecycle filter renders plain
 * `<a href="/admin/c/posts?status=draft">` anchors. Page transitions
 * are full-document loads — no client router. Fine for a 1–2 operator
 * admin and keeps the bundle small.
 */

const STATUS_LABELS: Record<SidebarStatus, string> = {
  draft: "Drafts",
  review: "In Review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

interface AdminShellProps {
  brand?: string;
  children: React.ReactNode;
}

function isPathActive(
  pathname: string,
  prefix: string,
  exact = false,
): boolean {
  if (exact) return pathname === prefix;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function statusesFor(c: Collection): SidebarStatus[] {
  return c.lifecycle === "editorial" ? EDITORIAL_STATUSES : SIMPLE_STATUSES;
}

export function AdminShell({
  brand = "CMS",
  children,
}: AdminShellProps): React.ReactElement {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/admin";
  const activeStatus =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("status")
      : null;

  const me = useQuery<AdminUser>({
    queryKey: ["me"],
    queryFn: () => api.get<AdminUser>("/me"),
    retry: false,
  });
  const collectionsQuery = useQuery<Collection[]>({
    queryKey: ["collections"],
    queryFn: async () => {
      const res = await api.get<{ collections: Collection[] }>("/collections");
      return res.collections;
    },
  });
  const collections = collectionsQuery.data ?? [];

  const homeActive = isPathActive(pathname, "/admin", true);
  const approvalsActive = isPathActive(pathname, "/admin/approvals");
  const settingsActive = isPathActive(pathname, "/admin/settings");

  return (
    <SidebarProvider>
      <Sidebar variant="inset">
        <SidebarHeader>
          <a
            href="/admin"
            className="flex items-center gap-1 px-2 py-1.5 font-semibold text-foreground no-underline"
          >
            <span>{brand}</span>
          </a>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={homeActive}>
                  <a href="/admin">
                    <Home aria-hidden="true" />
                    <span>Home</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Content</SidebarGroupLabel>
            <SidebarGroupContent>
              {collectionsQuery.isLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Loading…
                </p>
              ) : collections.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  No collections defined yet.
                </p>
              ) : (
                <SidebarMenu>
                  {collections.map((schema) => {
                    const basePath = `/admin/c/${schema.name}`;
                    const groupActive = isPathActive(pathname, basePath);
                    const statuses = statusesFor(schema);
                    return (
                      <Collapsible
                        key={schema.name}
                        defaultOpen={groupActive}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton isActive={groupActive}>
                              <Folder aria-hidden="true" />
                              <span className="flex-1 truncate">
                                {schema.title}
                              </span>
                              {schema.localized && (
                                <span
                                  role="img"
                                  aria-label="Localized"
                                  title="Localized"
                                  className="inline-flex"
                                >
                                  <Globe
                                    className="size-3.5 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                </span>
                              )}
                              <ChevronRight
                                aria-hidden="true"
                                className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                              />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {statuses.map((status) => {
                                const subActive =
                                  groupActive && activeStatus === status;
                                return (
                                  <SidebarMenuSubItem key={status}>
                                    <SidebarMenuSubButton
                                      asChild
                                      isActive={subActive}
                                    >
                                      <a href={`${basePath}?status=${status}`}>
                                        {STATUS_LABELS[status]}
                                      </a>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              )}
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>More</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={approvalsActive}>
                  <a href="/admin/approvals">
                    <ClipboardList aria-hidden="true" />
                    <span>Approvals</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={settingsActive}>
                  <a href="/admin/settings">
                    <SettingsIcon aria-hidden="true" />
                    <span>Settings</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="glass-strip sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger />
          <div className="ml-auto">
            <ProfileMenu
              login={me.data?.login ?? null}
              role={me.data?.role ?? null}
            />
          </div>
        </header>
        <div className="flex-1 p-6 pb-12">{children}</div>
      </SidebarInset>

      <footer className="glass-strip fixed inset-x-0 bottom-0 z-30 flex h-7 items-center justify-end gap-2 px-4 text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
        <span className="font-display normal-case tracking-normal text-[11px] text-foreground/70">
          {brand}
        </span>
        <span className="text-foreground/30" aria-hidden>
          ·
        </span>
        <span>admin</span>
      </footer>
    </SidebarProvider>
  );
}

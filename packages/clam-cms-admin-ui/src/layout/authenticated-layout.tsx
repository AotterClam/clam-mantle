import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardList,
  Folder,
  Globe,
  Home,
  Settings as SettingsIcon,
} from "lucide-react";

import { LayoutProvider } from "../context/layout-provider";
import { SidebarInset, SidebarProvider } from "../ui/sidebar";
import { api } from "../lib/api";
import {
  EDITORIAL_STATUSES,
  SIMPLE_STATUSES,
  type AdminUser,
  type Collection,
  type SidebarStatus,
} from "../lib/types";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { Main } from "./main";
import { SkipToMain } from "./skip-to-main";
import type { AdminBrand, NavGroupData, NavItem, NavLink } from "./types";

interface AuthenticatedLayoutProps {
  brand?: AdminBrand;
  fixed?: boolean;
  fluid?: boolean;
  children: React.ReactNode;
}

const STATUS_LABELS: Record<SidebarStatus, string> = {
  draft: "Drafts",
  review: "In Review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

const DEFAULT_BRAND: AdminBrand = {
  title: "CMS",
  subtitle: "admin",
  href: "/admin",
};

export function AuthenticatedLayout({
  brand = DEFAULT_BRAND,
  fixed = false,
  fluid = false,
  children,
}: AuthenticatedLayoutProps): React.ReactElement {
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/admin";
  const search =
    typeof window !== "undefined" ? window.location.search : "";

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

  const groups = React.useMemo<ReadonlyArray<NavGroupData>>(
    () => buildNavGroups(collectionsQuery.data ?? []),
    [collectionsQuery.data],
  );

  return (
    <LayoutProvider>
      <SidebarProvider>
        <SkipToMain />
        <AppSidebar
          brand={brand}
          groups={groups}
          pathname={pathname}
          search={search}
          user={{
            login: me.data?.login ?? null,
            role: me.data?.role ?? null,
          }}
        />
        <SidebarInset>
          <Header
            fixed
            user={{
              login: me.data?.login ?? null,
              role: me.data?.role ?? null,
            }}
          />
          <Main fixed={fixed} fluid={fluid}>
            {children}
          </Main>
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  );
}

function buildNavGroups(
  collections: ReadonlyArray<Collection>,
): ReadonlyArray<NavGroupData> {
  const homeGroup: NavGroupData = {
    items: [
      {
        title: "Home",
        url: "/admin",
        icon: Home,
      },
    ],
  };

  const contentGroup: NavGroupData = {
    title: "Content",
    items: collections.map<NavItem>((c) => ({
      title: c.title,
      // Leading icon is always Folder so every content row reads the
      // same. The Globe sits in the trailing `marker` slot to mark
      // collections that fold a translation-child schema underneath
      // — POC sidebar contract.
      icon: Folder,
      marker: c.hasTranslations ? Globe : undefined,
      items: statusesFor(c).map<NavLink>((status) => ({
        title: STATUS_LABELS[status],
        url: `/admin/c/${c.name}?status=${status}`,
      })),
    })),
  };

  const moreGroup: NavGroupData = {
    title: "More",
    items: [
      { title: "Approvals", url: "/admin/approvals", icon: ClipboardList },
      { title: "Settings", url: "/admin/settings", icon: SettingsIcon },
    ],
  };

  return [homeGroup, contentGroup, moreGroup];
}

function statusesFor(c: Collection): ReadonlyArray<SidebarStatus> {
  return c.lifecycle === "editorial" ? EDITORIAL_STATUSES : SIMPLE_STATUSES;
}

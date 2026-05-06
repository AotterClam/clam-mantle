export type Lifecycle = "simple" | "editorial";

export type SidebarStatus = "draft" | "review" | "approved" | "scheduled" | "published";

export interface Collection {
  name: string;
  title: string;
  description: string | null;
  lifecycle: Lifecycle;
  localized: boolean;
}

export interface AdminUser {
  login: string | null;
  role: "owner" | "editor" | "contributor" | null;
  userId?: string;
}

export interface EntryRow {
  id: string;
  collection: string;
  locale: string | null;
  status: string;
  version: number;
  title: unknown;
  updated_at: number;
}

export interface ListEntriesResult {
  items: EntryRow[];
  next_cursor: string | null;
}

export const EDITORIAL_STATUSES: SidebarStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "published",
];
export const SIMPLE_STATUSES: SidebarStatus[] = ["published"];

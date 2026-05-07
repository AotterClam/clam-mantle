export type Lifecycle = "simple" | "editorial";

export type ContentStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export type SidebarStatus = "draft" | "review" | "published" | "archived";

export interface Collection {
  name: string;
  title: string;
  description: string | null;
  lifecycle: Lifecycle;
  /** `true` when some other Schema lists this collection as the
   *  `translates.parent` — i.e. it is the i18n parent in a parent +
   *  translations pair. Translation-child Schemas (those with
   *  `spec.translates`) are filtered out of `/admin/api/collections`
   *  entirely; they fold into their parent in the sidebar. */
  hasTranslations: boolean;
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

export interface SiteInfo {
  title: string;
  description: string;
  origin: string;
  brand: string;
  locales: string[];
  canonicalLocale: string | null;
  publicUrl: string;
  mcpUrl: string;
}

export const EDITORIAL_STATUSES: SidebarStatus[] = [
  "draft",
  "review",
  "published",
  "archived",
];
export const SIMPLE_STATUSES: SidebarStatus[] = ["draft", "published", "archived"];

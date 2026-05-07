import type { SidebarStatus } from "../../lib/types";

export const STATUS_LABELS: Record<SidebarStatus, string> = {
  draft: "Drafts",
  review: "In Review",
  published: "Published",
  archived: "Archived",
};

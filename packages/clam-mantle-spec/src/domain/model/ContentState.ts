/**
 * Editorial flow state. Branch-style revision: each edit creates a revision
 * row; `status` lives on the head row in `entries`.
 *
 *   draft → review → approved → scheduled → published
 *     ↑       │
 *     └── rejected
 */
export const ContentState = {
  Draft: "draft",
  Review: "review",
  Approved: "approved",
  Scheduled: "scheduled",
  Published: "published",
  Archived: "archived",
} as const;
export type ContentState = (typeof ContentState)[keyof typeof ContentState];

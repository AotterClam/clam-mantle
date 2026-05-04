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

export interface Entry {
  readonly id: string;
  readonly collection: string;
  /** Per-row locale, lifted from `data.locale` for ergonomic access.
   *  `undefined` when the source Schema is not localized
   *  (`Schema.spec.localized !== true`). Equivalent to
   *  `entry.data.locale` when set; the entry storage layer is the
   *  source of truth. */
  readonly locale?: string;
  readonly status: ContentState;
  /** Optimistic-locking version. Increments on every persisted update. */
  readonly version: number;
  readonly data: Record<string, unknown>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface Revision {
  readonly id: string;
  readonly entryId: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
  readonly createdAt: number;
  readonly authorId: string | null;
  readonly note: string | null;
}

export interface Approval {
  readonly id: string;
  readonly entryId: string;
  readonly requestedBy: string;
  readonly requestedAt: number;
  readonly note: string | null;
  readonly status: "pending" | "approved" | "rejected";
  readonly resolvedBy: string | null;
  readonly resolvedAt: number | null;
}

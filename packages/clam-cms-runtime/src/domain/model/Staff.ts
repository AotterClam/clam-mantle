import type { StaffRole } from "@aotterclam/clam-cms-spec";

/**
 * `Staff` — privilege overlay on `User`. A user with a `staff` row has
 * admin access at the role indicated. The closed-enum role vocabulary
 * (`owner` / `editor` / `contributor`) lives in spec
 * (`domain/model/ManifestGrammar`) so the manifest grammar can
 * reference it via `requires.auth.all: [{ ctx.staff: [...] }]`; the
 * row shape lives here because only the dispatcher fills it.
 *
 * `Staff.userId` references `User.id` — staff is not a separate
 * identity, just a rights overlay.
 */
export interface Staff {
  readonly userId: string;
  readonly role: StaffRole;
  readonly grantedBy: string | null;
  readonly grantedAt: number;
}

/**
 * `StaffMembership` — denormalized convenience for handlers that need
 * both the role and the underlying `User` row. The dispatcher builds
 * this when resolving `HandlerContext.staff`.
 */
export interface StaffMembership {
  readonly userId: string;
  readonly role: StaffRole;
  readonly email: string;
  readonly name: string | null;
}

import type { StaffMembership } from "../model/Staff.js";

export interface StaffListEntry extends StaffMembership {
  readonly githubLogin: string | null;
}

export interface BootstrapOwnerOpts {
  /** Internal user id for the signing-in user. */
  readonly userId: string;
  /** GitHub login string for the signing-in user (case-insensitive match). */
  readonly githubLogin: string;
  /**
   * Expected GitHub login from `ADMIN_GITHUB_LOGIN` env var.
   * No-op when empty.
   */
  readonly adminGithubLogin: string;
  readonly now: number;
}

/**
 * `StaffRepository` — port for staff roster reads and bootstrap.
 * Implemented by `D1StaffRepository` in the Cloudflare adapter.
 *
 * Staff CRUD (add / remove / promote) is intentionally omitted here —
 * those are admin-UI-only operations (never MCP) added in a later issue.
 */
export interface StaffRepository {
  /** Full roster with GitHub login, for admin UI display. */
  listAll(): Promise<StaffListEntry[]>;
  /**
   * Bootstrap the first owner. No-op when any staff row already exists,
   * or when `githubLogin` does not match `adminGithubLogin`.
   * The env-var gate (not "first user wins") prevents the race where
   * someone signs in before the site owner during initial deploy.
   */
  ensureBootstrapOwner(opts: BootstrapOwnerOpts): Promise<void>;
}

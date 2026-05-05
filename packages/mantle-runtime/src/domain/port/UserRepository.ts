import type { User } from "../model/User.js";
import type { GithubProfile } from "../model/GithubProfile.js";

export interface GithubToken {
  readonly accessToken: string;
  readonly scope: string;
}

/**
 * `UserRepository` — CRUD port for `users` and `github_tokens` rows.
 * Implemented by `D1UserRepository` in the Cloudflare adapter.
 * Used by the GitHub OAuth callback to upsert identities and cache
 * access tokens for `tokenExchangeCallback` revocation probes.
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /**
   * Upsert a user row by GitHub id (immutable across login renames).
   * Returns the `users.id` (uuid) for the resolved row.
   */
  upsertByGithub(profile: GithubProfile, now: number): Promise<string>;
  /** Persist (or replace) the GitHub access token for a user. */
  storeGithubToken(
    userId: string,
    accessToken: string,
    scope: string,
    now: number,
  ): Promise<void>;
  readGithubToken(userId: string): Promise<GithubToken | null>;
}

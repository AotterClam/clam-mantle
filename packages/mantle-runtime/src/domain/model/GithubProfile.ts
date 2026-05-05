/**
 * `GithubProfile` — value object returned by the GitHub `/user` API.
 * Consumed by `UserRepository.upsertByGithub` during the OAuth callback.
 * Lives in `domain/model/` because it's the canonical input shape for
 * user upsert — the cloudflare adapter maps raw GitHub JSON → this VO,
 * then hands it to the port.
 */
export interface GithubProfile {
  readonly id: number;
  readonly login: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

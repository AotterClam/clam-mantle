import type { GithubProfile, GithubToken, User, UserRepository } from "@aotter/mantle-runtime";

export class D1UserRepository implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, name, created_at AS createdAt, updated_at AS updatedAt
         FROM users WHERE id = ?`,
      )
      .bind(id)
      .first<User>();
    return row ?? null;
  }

  async upsertByGithub(profile: GithubProfile, now: number): Promise<string> {
    const providerUid = String(profile.id);
    const existing = await this.db
      .prepare(
        `SELECT user_id AS userId FROM social_logins
         WHERE provider = 'github' AND provider_uid = ?`,
      )
      .bind(providerUid)
      .first<{ userId: string }>();

    if (existing) {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE social_logins SET login = ?, updated_at = ?
             WHERE user_id = ? AND provider = 'github'`,
          )
          .bind(profile.login, now, existing.userId),
        this.db
          .prepare(
            `UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?`,
          )
          .bind(profile.email, profile.name, now, existing.userId),
      ]);
      return existing.userId;
    }

    const id = crypto.randomUUID();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO users (id, email, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, profile.email, profile.name, now, now),
      this.db
        .prepare(
          `INSERT INTO social_logins (user_id, provider, provider_uid, login, updated_at)
           VALUES (?, 'github', ?, ?, ?)`,
        )
        .bind(id, providerUid, profile.login, now),
    ]);
    return id;
  }

  async storeGithubToken(
    userId: string,
    accessToken: string,
    scope: string,
    now: number,
  ): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO github_tokens (user_id, access_token, scope, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           access_token = excluded.access_token,
           scope        = excluded.scope,
           updated_at   = excluded.updated_at`,
      )
      .bind(userId, accessToken, scope, now)
      .run();
  }

  async readGithubToken(userId: string): Promise<GithubToken | null> {
    const row = await this.db
      .prepare(
        `SELECT access_token AS accessToken, scope
         FROM github_tokens WHERE user_id = ?`,
      )
      .bind(userId)
      .first<GithubToken>();
    return row ?? null;
  }
}

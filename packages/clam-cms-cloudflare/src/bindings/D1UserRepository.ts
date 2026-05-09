import {
  RandomUuidGenerator,
  type GithubProfile,
  type GithubToken,
  type IdGenerator,
  type User,
  type UserRepository,
} from "@aotterclam/clam-cms-runtime";

export class D1UserRepository implements UserRepository {
  constructor(
    private readonly db: D1Database,
    private readonly idgen: IdGenerator = RandomUuidGenerator,
  ) {}

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

  async findGithubLogin(userId: string): Promise<string | null> {
    const row = await this.db
      .prepare(
        `SELECT login FROM social_logins
         WHERE user_id = ? AND provider = 'github' LIMIT 1`,
      )
      .bind(userId)
      .first<{ login: string }>();
    return row?.login ?? null;
  }

  async upsertByGithub(profile: GithubProfile, now: number): Promise<string> {
    const providerUid = String(profile.id);
    // ON CONFLICT DO UPDATE + RETURNING collapses the select-then-insert into a single
    // atomic statement. Concurrent first-sign-ins for the same GitHub user both hit this
    // statement; SQLite serialises writes, so exactly one inserts and the other updates —
    // both receive the same user_id from RETURNING. The candidate UUID is discarded on
    // conflict (not in the SET clause), so no orphaned rows are created.
    const row = await this.db
      .prepare(
        `INSERT INTO social_logins (user_id, provider, provider_uid, login, updated_at)
         VALUES (?, 'github', ?, ?, ?)
         ON CONFLICT(provider, provider_uid) DO UPDATE SET
           login       = excluded.login,
           updated_at  = excluded.updated_at
         RETURNING user_id`,
      )
      .bind(this.idgen.next(), providerUid, profile.login, now)
      .first<{ user_id: string }>();

    const userId = row!.user_id;
    // INSERT OR IGNORE ensures the users row exists (no-op if already present);
    // UPDATE then refreshes the mutable profile fields unconditionally.
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO users (id, email, name, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(userId, profile.email, profile.name, now, now),
      this.db
        .prepare(`UPDATE users SET email = ?, name = ?, updated_at = ? WHERE id = ?`)
        .bind(profile.email, profile.name, now, userId),
    ]);
    return userId;
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

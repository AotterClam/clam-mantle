import type {
  GithubToken,
  UserRepository,
} from "@aotter/mantle-runtime";
import type { User } from "@aotter/mantle-runtime";
import type { GithubProfile } from "@aotter/mantle-runtime";

export class D1UserRepository implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<User | null> {
    const row = await this.db
      .prepare(
        `SELECT id, email, name, github_id, github_login, created_at, updated_at
         FROM users WHERE id = ?`,
      )
      .bind(id)
      .first<{
        id: string;
        email: string | null;
        name: string | null;
        github_id: number | null;
        github_login: string | null;
        created_at: number;
        updated_at: number;
      }>();
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      githubId: row.github_id,
      githubLogin: row.github_login,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsertByGithub(profile: GithubProfile, now: number): Promise<string> {
    const existing = await this.db
      .prepare(`SELECT id FROM users WHERE github_id = ?`)
      .bind(profile.id)
      .first<{ id: string }>();
    if (existing) {
      await this.db
        .prepare(
          `UPDATE users SET github_login = ?, email = ?, name = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(profile.login, profile.email, profile.name, now, existing.id)
        .run();
      return existing.id;
    }
    const id = crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT INTO users (id, github_id, github_login, email, name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, profile.id, profile.login, profile.email, profile.name, now, now)
      .run();
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
      .prepare(`SELECT access_token, scope FROM github_tokens WHERE user_id = ?`)
      .bind(userId)
      .first<{ access_token: string; scope: string }>();
    if (!row) return null;
    return { accessToken: row.access_token, scope: row.scope };
  }
}

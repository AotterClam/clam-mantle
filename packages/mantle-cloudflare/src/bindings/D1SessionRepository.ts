import type { Session, SessionRepository } from "@aotter/mantle-runtime";

/**
 * `SessionRepository` impl backed by the same D1 database the
 * `DatabaseDriver` uses. Schema:
 *
 * ```
 * CREATE TABLE sessions (
 *   token TEXT PRIMARY KEY,
 *   user_id TEXT NOT NULL,
 *   created_at INTEGER NOT NULL,
 *   expires_at INTEGER NOT NULL
 * );
 * CREATE INDEX sessions_user_id ON sessions(user_id);
 * ```
 *
 * (Migration ships in the canonical migration list.) Adapters that
 * want stateless / cookie-only sessions plug a different impl into
 * the same port.
 */
export class D1SessionRepository implements SessionRepository {
  constructor(private readonly db: D1Database) {}

  async read(token: string): Promise<Session | null> {
    const row = await this.db
      .prepare(
        `SELECT token, user_id AS userId, created_at AS createdAt, expires_at AS expiresAt
         FROM sessions WHERE token = ? AND expires_at > ?`,
      )
      .bind(token, Date.now())
      .first<Session>();
    return row ?? null;
  }

  async write(session: Session): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(session.token, session.userId, session.createdAt, session.expiresAt)
      .run();
  }

  async invalidate(token: string): Promise<void> {
    await this.db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  }
}

import { isStaffRole, type StaffRole } from "@aotterclam/clam-cms-spec";
import type { BootstrapOwnerOpts, Staff, StaffListEntry, StaffRepository } from "@aotterclam/clam-cms-runtime";

export class D1StaffRepository implements StaffRepository {
  constructor(private readonly db: D1Database) {}

  async listAll(): Promise<StaffListEntry[]> {
    const rs = await this.db
      .prepare(
        `SELECT s.user_id, s.role, s.granted_by, s.granted_at,
                u.email, u.name, sl.login AS github_login
         FROM staff s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN social_logins sl ON sl.user_id = s.user_id AND sl.provider = 'github'
         ORDER BY s.granted_at`,
      )
      .all<{
        user_id: string;
        role: string;
        granted_by: string | null;
        granted_at: number;
        email: string | null;
        name: string | null;
        github_login: string | null;
      }>();
    return (rs.results ?? [])
      .filter((r) => isStaffRole(r.role))
      .map((r) => ({
        userId: r.user_id,
        role: r.role as StaffRole,
        grantedBy: r.granted_by,
        grantedAt: r.granted_at,
        email: r.email,
        name: r.name,
        githubLogin: r.github_login,
      }));
  }

  async readByUserId(userId: string): Promise<Staff | null> {
    const row = await this.db
      .prepare(`SELECT user_id, role, granted_by, granted_at FROM staff WHERE user_id = ? LIMIT 1`)
      .bind(userId)
      .first<{ user_id: string; role: string; granted_by: string | null; granted_at: number }>();
    if (!row || !isStaffRole(row.role)) return null;
    return { userId: row.user_id, role: row.role as StaffRole, grantedBy: row.granted_by, grantedAt: row.granted_at };
  }

  async ensureBootstrapOwner(opts: BootstrapOwnerOpts): Promise<void> {
    const { userId, githubLogin, adminGithubLogin, now } = opts;
    if (!adminGithubLogin) return;
    if (githubLogin.toLowerCase() !== adminGithubLogin.toLowerCase()) return;
    // WHERE NOT EXISTS makes the guard atomic — no separate SELECT round trip,
    // and no TOCTOU window between checking "table empty" and inserting.
    await this.db
      .prepare(
        `INSERT INTO staff (user_id, role, granted_by, granted_at)
         SELECT ?, 'owner', ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM staff)`,
      )
      .bind(userId, userId, now)
      .run();
  }
}

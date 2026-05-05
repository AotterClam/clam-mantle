import { isStaffRole, type StaffRole } from "@aotter/mantle-spec";
import type {
  BootstrapOwnerOpts,
  StaffListEntry,
  StaffRepository,
} from "@aotter/mantle-runtime";

export class D1StaffRepository implements StaffRepository {
  constructor(private readonly db: D1Database) {}

  async listAll(): Promise<StaffListEntry[]> {
    const rs = await this.db
      .prepare(
        `SELECT s.user_id, s.role, s.granted_by, s.granted_at,
                u.email, u.name, u.github_login
         FROM staff s JOIN users u ON u.id = s.user_id
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
        email: r.email ?? "",
        name: r.name,
        githubLogin: r.github_login,
      }));
  }

  async ensureBootstrapOwner(opts: BootstrapOwnerOpts): Promise<void> {
    const { userId, githubLogin, adminGithubLogin, now } = opts;
    if (!adminGithubLogin) return;
    if (githubLogin.toLowerCase() !== adminGithubLogin.toLowerCase()) return;
    const existing = await this.db
      .prepare(`SELECT 1 FROM staff LIMIT 1`)
      .first();
    if (existing) return;
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO staff (user_id, role, granted_by, granted_at)
         VALUES (?, 'owner', ?, ?)`,
      )
      .bind(userId, userId, now)
      .run();
  }
}

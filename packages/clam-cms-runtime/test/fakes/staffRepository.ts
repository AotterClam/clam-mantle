import type {
  BootstrapOwnerOpts,
  StaffListEntry,
  StaffRepository,
} from "../../src/domain/port/StaffRepository.js";
import type { StaffRole } from "@aotterclam/clam-cms-spec";

interface StaffRecord {
  userId: string;
  role: StaffRole;
  grantedBy: string | null;
  grantedAt: number;
  email: string;
  name: string | null;
  githubLogin: string | null;
}

export class InMemoryStaffRepository implements StaffRepository {
  private staff = new Map<string, StaffRecord>();

  _seedStaff(r: StaffRecord): void {
    this.staff.set(r.userId, r);
  }

  async listAll(): Promise<StaffListEntry[]> {
    return [...this.staff.values()].sort((a, b) => a.grantedAt - b.grantedAt);
  }

  async ensureBootstrapOwner(opts: BootstrapOwnerOpts): Promise<void> {
    const { userId, githubLogin, adminGithubLogin, now } = opts;
    if (!adminGithubLogin) return;
    if (githubLogin.toLowerCase() !== adminGithubLogin.toLowerCase()) return;
    if (this.staff.size > 0) return;
    this.staff.set(userId, {
      userId,
      role: "owner",
      grantedBy: userId,
      grantedAt: now,
      email: "",
      name: null,
      githubLogin,
    });
  }
}

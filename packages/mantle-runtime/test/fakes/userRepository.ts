import type { GithubToken, UserRepository } from "../../src/domain/port/UserRepository.js";
import type { GithubProfile } from "../../src/domain/model/GithubProfile.js";
import type { User } from "../../src/domain/model/User.js";

interface UserRecord {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: number;
  updatedAt: number;
}

interface SocialLoginRecord {
  userId: string;
  provider: string;
  providerUid: string;
  login: string | null;
  updatedAt: number;
}

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, UserRecord>();
  private socialLogins: SocialLoginRecord[] = [];
  private tokens = new Map<string, GithubToken>();

  async findById(id: string): Promise<User | null> {
    const r = this.users.get(id);
    return r ? { ...r } : null;
  }

  async upsertByGithub(profile: GithubProfile, now: number): Promise<string> {
    const providerUid = String(profile.id);
    const existing = this.socialLogins.find(
      (sl) => sl.provider === "github" && sl.providerUid === providerUid,
    );
    if (existing) {
      existing.login = profile.login;
      existing.updatedAt = now;
      const u = this.users.get(existing.userId)!;
      u.email = profile.email;
      u.name = profile.name;
      u.updatedAt = now;
      return existing.userId;
    }
    const id = `user-${this.users.size + 1}`;
    this.users.set(id, {
      id,
      email: profile.email,
      name: profile.name,
      createdAt: now,
      updatedAt: now,
    });
    this.socialLogins.push({
      userId: id,
      provider: "github",
      providerUid,
      login: profile.login,
      updatedAt: now,
    });
    return id;
  }

  async storeGithubToken(
    userId: string,
    accessToken: string,
    scope: string,
    _now: number,
  ): Promise<void> {
    this.tokens.set(userId, { accessToken, scope });
  }

  async readGithubToken(userId: string): Promise<GithubToken | null> {
    return this.tokens.get(userId) ?? null;
  }
}

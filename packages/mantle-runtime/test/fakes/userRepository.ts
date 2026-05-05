import type { GithubToken, UserRepository } from "../../src/domain/port/UserRepository.js";
import type { GithubProfile } from "../../src/domain/model/GithubProfile.js";
import type { User } from "../../src/domain/model/User.js";

interface UserRecord {
  id: string;
  githubId: number | null;
  githubLogin: string | null;
  email: string | null;
  name: string | null;
  createdAt: number;
  updatedAt: number;
}

export class InMemoryUserRepository implements UserRepository {
  private users = new Map<string, UserRecord>();
  private githubIdIndex = new Map<number, string>();
  private tokens = new Map<string, GithubToken>();

  async findById(id: string): Promise<User | null> {
    const r = this.users.get(id);
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      name: r.name,
      githubId: r.githubId,
      githubLogin: r.githubLogin,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async upsertByGithub(profile: GithubProfile, now: number): Promise<string> {
    const existingId = this.githubIdIndex.get(profile.id);
    if (existingId) {
      const r = this.users.get(existingId)!;
      r.githubLogin = profile.login;
      r.email = profile.email;
      r.name = profile.name;
      r.updatedAt = now;
      return existingId;
    }
    const id = `user-${this.users.size + 1}`;
    const record: UserRecord = {
      id,
      githubId: profile.id,
      githubLogin: profile.login,
      email: profile.email,
      name: profile.name,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(id, record);
    this.githubIdIndex.set(profile.id, id);
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

import { describe, expect, it } from "vitest";
import { InMemoryUserRepository } from "./fakes/userRepository.js";
import { InMemoryStaffRepository } from "./fakes/staffRepository.js";
import type { GithubProfile } from "../src/domain/model/GithubProfile.js";

const ALICE: GithubProfile = {
  id: 1001,
  login: "alice",
  email: "alice@example.com",
  name: "Alice",
  avatarUrl: null,
};

describe("UserRepository.upsertByGithub", () => {
  it("creates a new user on first sign-in", async () => {
    const repo = new InMemoryUserRepository();
    const id = await repo.upsertByGithub(ALICE, 1000);
    const user = await repo.findById(id);
    expect(user?.email).toBe("alice@example.com");
    expect(user?.name).toBe("Alice");
    expect(user?.createdAt).toBe(1000);
  });

  it("returns the same id on subsequent sign-ins with the same github_id", async () => {
    const repo = new InMemoryUserRepository();
    const id1 = await repo.upsertByGithub(ALICE, 1000);
    const id2 = await repo.upsertByGithub({ ...ALICE, login: "alice-renamed" }, 2000);
    expect(id1).toBe(id2);
  });

  it("updates name and email on subsequent sign-in", async () => {
    const repo = new InMemoryUserRepository();
    const id = await repo.upsertByGithub(ALICE, 1000);
    await repo.upsertByGithub({ ...ALICE, email: "new@example.com", name: "Alice B" }, 2000);
    const user = await repo.findById(id);
    expect(user?.email).toBe("new@example.com");
    expect(user?.name).toBe("Alice B");
    expect(user?.updatedAt).toBe(2000);
  });

  it("treats two different github_ids as two users", async () => {
    const repo = new InMemoryUserRepository();
    const id1 = await repo.upsertByGithub(ALICE, 1000);
    const id2 = await repo.upsertByGithub({ ...ALICE, id: 1002, login: "bob" }, 1000);
    expect(id1).not.toBe(id2);
  });
});

describe("UserRepository github tokens", () => {
  it("returns null when no token stored", async () => {
    const repo = new InMemoryUserRepository();
    expect(await repo.readGithubToken("u1")).toBeNull();
  });

  it("round-trips a stored token", async () => {
    const repo = new InMemoryUserRepository();
    const id = await repo.upsertByGithub(ALICE, 1000);
    await repo.storeGithubToken(id, "test-github-token-abc", "read:user user:email", 1000);
    const token = await repo.readGithubToken(id);
    expect(token?.accessToken).toBe("test-github-token-abc");
    expect(token?.scope).toBe("read:user user:email");
  });

  it("overwrites on second store", async () => {
    const repo = new InMemoryUserRepository();
    const id = await repo.upsertByGithub(ALICE, 1000);
    await repo.storeGithubToken(id, "test-github-token-old", "read:user", 1000);
    await repo.storeGithubToken(id, "test-github-token-new", "read:user user:email", 2000);
    const token = await repo.readGithubToken(id);
    expect(token?.accessToken).toBe("test-github-token-new");
  });
});

describe("StaffRepository.ensureBootstrapOwner", () => {
  it("inserts owner when no staff exists and login matches", async () => {
    const repo = new InMemoryStaffRepository();
    await repo.ensureBootstrapOwner({
      userId: "u1",
      githubLogin: "alice",
      adminGithubLogin: "alice",
      now: 1000,
    });
    const staff = await repo.listAll();
    expect(staff).toHaveLength(1);
    expect(staff[0]?.userId).toBe("u1");
    expect(staff[0]?.role).toBe("owner");
  });

  it("is case-insensitive for login match", async () => {
    const repo = new InMemoryStaffRepository();
    await repo.ensureBootstrapOwner({
      userId: "u1",
      githubLogin: "Alice",
      adminGithubLogin: "ALICE",
      now: 1000,
    });
    expect(await repo.listAll()).toHaveLength(1);
  });

  it("no-op when login does not match ADMIN_GITHUB_LOGIN", async () => {
    const repo = new InMemoryStaffRepository();
    await repo.ensureBootstrapOwner({
      userId: "u1",
      githubLogin: "bob",
      adminGithubLogin: "alice",
      now: 1000,
    });
    expect(await repo.listAll()).toHaveLength(0);
  });

  it("no-op when staff already exists", async () => {
    const repo = new InMemoryStaffRepository();
    repo._seedStaff({
      userId: "u0",
      role: "owner",
      grantedBy: null,
      grantedAt: 0,
      email: "owner@example.com",
      name: null,
      githubLogin: "owner",
    });
    await repo.ensureBootstrapOwner({
      userId: "u1",
      githubLogin: "alice",
      adminGithubLogin: "alice",
      now: 1000,
    });
    expect(await repo.listAll()).toHaveLength(1);
  });

  it("no-op when ADMIN_GITHUB_LOGIN is empty", async () => {
    const repo = new InMemoryStaffRepository();
    await repo.ensureBootstrapOwner({
      userId: "u1",
      githubLogin: "alice",
      adminGithubLogin: "",
      now: 1000,
    });
    expect(await repo.listAll()).toHaveLength(0);
  });
});

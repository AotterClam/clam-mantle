import { describe, expect, it } from "vitest";
import { assembleHandlerContext, readActiveSession, readStaff } from "../src/infrastructure/auth/index.js";
import { InMemoryDatabase } from "./fakes/database.js";
import { InMemorySessions } from "./fakes/session.js";

function reqWithCookie(name: string, value: string): Request {
  return new Request("https://example.com/", {
    headers: { cookie: `${name}=${encodeURIComponent(value)}` },
  });
}

describe("readActiveSession", () => {
  it("returns null when no cookie", async () => {
    const sessions = new InMemorySessions();
    const result = await readActiveSession({
      req: new Request("https://example.com/"),
      sessions,
    });
    expect(result).toBeNull();
  });

  it("returns null when token unknown", async () => {
    const sessions = new InMemorySessions();
    const result = await readActiveSession({
      req: reqWithCookie("clam_cms_session", "ghost"),
      sessions,
    });
    expect(result).toBeNull();
  });

  it("returns null for expired sessions", async () => {
    const sessions = new InMemorySessions();
    sessions._seed({
      token: "tok",
      userId: "u1",
      createdAt: 0,
      expiresAt: 100,
    });
    const result = await readActiveSession({
      req: reqWithCookie("clam_cms_session", "tok"),
      sessions,
      now: () => 200,
    });
    expect(result).toBeNull();
  });

  it("returns the session for live tokens", async () => {
    const sessions = new InMemorySessions();
    sessions._seed({
      token: "tok",
      userId: "u1",
      createdAt: 0,
      expiresAt: 1_000_000_000_000,
    });
    const result = await readActiveSession({
      req: reqWithCookie("clam_cms_session", "tok"),
      sessions,
      now: () => 100,
    });
    expect(result?.userId).toBe("u1");
  });
});

describe("readStaff", () => {
  it("returns null for users with no staff overlay", async () => {
    const db = new InMemoryDatabase();
    expect(await readStaff(db, "u1")).toBeNull();
  });

  it("returns the staff record when present", async () => {
    const db = new InMemoryDatabase();
    db._seedStaff({
      user_id: "u1",
      role: "editor",
      granted_by: "owner-1",
      granted_at: 100,
    });
    const staff = await readStaff(db, "u1");
    expect(staff).toEqual({
      userId: "u1",
      role: "editor",
      grantedBy: "owner-1",
      grantedAt: 100,
    });
  });
});

describe("assembleHandlerContext", () => {
  it("anonymous request → user/staff null", async () => {
    const db = new InMemoryDatabase();
    const sessions = new InMemorySessions();
    const ctx = await assembleHandlerContext({
      req: new Request("https://example.com/"),
      db,
      sessions,
      env: { foo: 1 },
    });
    expect(ctx).toEqual({
      user: null,
      staff: null,
      env: { foo: 1 },
      waitUntil: undefined,
    });
  });

  it("logged-in user without staff overlay → user filled, staff null", async () => {
    const db = new InMemoryDatabase();
    const sessions = new InMemorySessions();
    sessions._seed({
      token: "tok",
      userId: "u1",
      createdAt: 0,
      expiresAt: 1_000_000_000_000,
    });
    const ctx = await assembleHandlerContext({
      req: reqWithCookie("clam_cms_session", "tok"),
      db,
      sessions,
      env: {},
      now: () => 100,
    });
    expect(ctx.user).toEqual({ id: "u1" });
    expect(ctx.staff).toBeNull();
  });

  it("staff member → both user and staff filled", async () => {
    const db = new InMemoryDatabase();
    db._seedStaff({ user_id: "u1", role: "owner", granted_by: null, granted_at: 1 });
    const sessions = new InMemorySessions();
    sessions._seed({
      token: "tok",
      userId: "u1",
      createdAt: 0,
      expiresAt: 1_000_000_000_000,
    });
    const ctx = await assembleHandlerContext({
      req: reqWithCookie("clam_cms_session", "tok"),
      db,
      sessions,
      env: {},
      now: () => 100,
    });
    expect(ctx.user).toEqual({ id: "u1" });
    expect(ctx.staff).toEqual({ id: "u1", role: "owner" });
  });
});

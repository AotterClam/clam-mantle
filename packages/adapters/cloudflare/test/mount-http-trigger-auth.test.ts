import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Manifest } from "@aotter/mantle-spec";
import { createCmsRef } from "../src/mount/bootRuntimeOnce.js";
import { mountServerEndpoints } from "../src/mount/mountServerEndpoints.js";
import type { Auth } from "../src/auth/createAuth.js";
import { InMemoryDatabase } from "../../../mantle-runtime/test/fakes/database.js";
import {
  InMemoryKv,
  StubAssetServer,
  stubAuth,
} from "./fakes/runtime-bindings.js";

/**
 * HTTP Trigger auth-context plumbing (#299). The pre-alpha.16 build
 * hardcoded `{ user: null, staff: null }` for HTTP Trigger calls, so
 * any Procedure that declared `requires.auth.all: [{ "ctx.staff": [...] }]`
 * was unreachable over HTTP regardless of the caller's role. The
 * fix mirrors `buildViewCtx`: cookie session resolves to a real
 * caller context, and the handler distinguishes 401 (no session)
 * from 403 (session, wrong role) — same shape as `handleViewRequest`.
 */

const apiVersion = "cms.mantle.aotter.net/v1" as const;

function staffGatedManifests(): Manifest[] {
  return [
    {
      apiVersion,
      kind: "Procedure",
      metadata: { name: "staff-only-op" },
      spec: {
        input: { type: "object" },
        output: { type: "object" },
        handler: { kind: "ref", ref: "staffOnlyOp" },
        requires: { auth: { all: [{ "ctx.staff": ["owner"] }] } },
      },
    },
    {
      apiVersion,
      kind: "Trigger",
      metadata: { name: "staff-only-http" },
      spec: {
        source: { kind: "http", method: "POST", path: "/api/staff-only" },
        target: { procedure: "staff-only-op" },
      },
    },
  ];
}

interface AuthFakeOpts {
  readonly role: string | null;
  readonly userId?: string;
}

function authFake(opts: AuthFakeOpts | null): Auth {
  if (opts === null) return stubAuth;
  const userId = opts.userId ?? "u-1";
  return {
    handler: async () => new Response(null, { status: 404 }),
    getSession: async () => ({
      session: {
        id: "s-1",
        userId,
        expiresAt: new Date(Date.now() + 60_000),
      },
      user: {
        id: userId,
        email: `${userId}@example.test`,
        name: "Test",
        role: opts.role,
        githubLogin: null,
      },
    }),
    getUserRole: async () => opts.role,
    methods: [],
  };
}

function buildApp(auth: Auth): Hono {
  const opCalls: Array<unknown> = [];
  const ref = createCmsRef({
    manifests: staffGatedManifests(),
    handlers: {
      staffOnlyOp: (input) => {
        opCalls.push(input);
        return { ok: true };
      },
    },
    bindings: {
      db: new InMemoryDatabase(),
      kv: new InMemoryKv(),
      assets: new StubAssetServer(),
    },
    auth,
  });
  const app = new Hono();
  mountServerEndpoints(app, ref);
  return app;
}

describe("mountServerEndpoints: HTTP Trigger ctx plumbing (#299)", () => {
  it("returns 401 UNAUTHENTICATED when no session and Procedure requires auth", async () => {
    const app = buildApp(authFake(null));
    const res = await app.request("/api/staff-only", { method: "POST" });
    expect(res.status).toBe(401);
    const body = (await res.json()) as {
      ok: boolean;
      diagnostic?: { code: string };
    };
    expect(body.ok).toBe(false);
    expect(body.diagnostic?.code).toBe("UNAUTHENTICATED");
  });

  it("returns 403 AUTH_DENIED when session exists but role is null (customer)", async () => {
    const app = buildApp(authFake({ role: null }));
    const res = await app.request("/api/staff-only", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as {
      ok: boolean;
      diagnostic?: { code: string };
    };
    expect(body.ok).toBe(false);
    expect(body.diagnostic?.code).toBe("AUTH_DENIED");
  });

  it("returns 403 AUTH_DENIED when session exists with a non-staff role", async () => {
    const app = buildApp(authFake({ role: "customer" }));
    const res = await app.request("/api/staff-only", { method: "POST" });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { diagnostic?: { code: string } };
    expect(body.diagnostic?.code).toBe("AUTH_DENIED");
  });

  it("allows the call through when session has the required staff role (this is the #299 regression case)", async () => {
    const app = buildApp(authFake({ role: "owner" }));
    const res = await app.request("/api/staff-only", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; data?: unknown };
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ ok: true });
  });

  it("allows a signed-in customer through `ctx.user` predicate (no staff required)", async () => {
    // `requires.auth.all: ["ctx.user"]` means "any signed-in user".
    // A customer session (role: null) should pass, distinguishing
    // ctx.user (signed-in) from ctx.staff (signed-in + role).
    const userOnlyManifests: Manifest[] = [
      {
        apiVersion,
        kind: "Procedure",
        metadata: { name: "user-only-op" },
        spec: {
          input: { type: "object" },
          output: { type: "object" },
          handler: { kind: "ref", ref: "userOnlyOp" },
          requires: { auth: { all: ["ctx.user"] } },
        },
      },
      {
        apiVersion,
        kind: "Trigger",
        metadata: { name: "user-only-http" },
        spec: {
          source: { kind: "http", method: "POST", path: "/api/user-only" },
          target: { procedure: "user-only-op" },
        },
      },
    ];
    const ref = createCmsRef({
      manifests: userOnlyManifests,
      handlers: { userOnlyOp: () => ({ ok: true }) },
      bindings: {
        db: new InMemoryDatabase(),
        kv: new InMemoryKv(),
        assets: new StubAssetServer(),
      },
      auth: authFake({ role: null }),
    });
    const app = new Hono();
    mountServerEndpoints(app, ref);
    const res = await app.request("/api/user-only", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("bearer-token-only caller (no cookie) hits the 401 branch — bearer auth is the MCP surface, not HTTP Trigger", async () => {
    // `buildCallerContext` resolves cookie sessions only. A request
    // with `Authorization: Bearer …` and no cookie should NOT silently
    // be treated as authenticated by the HTTP Trigger handler. The
    // stub auth's `getSession` returns null for any request without a
    // valid cookie, which is what we exercise here.
    const app = buildApp(authFake(null));
    const res = await app.request("/api/staff-only", {
      method: "POST",
      headers: { authorization: "Bearer some-token" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { diagnostic?: { code: string } };
    expect(body.diagnostic?.code).toBe("UNAUTHENTICATED");
  });

  it("falls back to a guest ctx (no 401) when Procedure has no requires.auth", async () => {
    // Procedures without requires.auth must remain reachable
    // anonymously — the 401 pre-check only fires when the manifest
    // explicitly opts in.
    const openManifests: Manifest[] = [
      {
        apiVersion,
        kind: "Procedure",
        metadata: { name: "open-op" },
        spec: {
          input: { type: "object" },
          output: { type: "object" },
          handler: { kind: "ref", ref: "openOp" },
        },
      },
      {
        apiVersion,
        kind: "Trigger",
        metadata: { name: "open-http" },
        spec: {
          source: { kind: "http", method: "POST", path: "/api/open" },
          target: { procedure: "open-op" },
        },
      },
    ];
    const ref = createCmsRef({
      manifests: openManifests,
      handlers: { openOp: () => ({ ok: true }) },
      bindings: {
        db: new InMemoryDatabase(),
        kv: new InMemoryKv(),
        assets: new StubAssetServer(),
      },
      auth: authFake(null),
    });
    const app = new Hono();
    mountServerEndpoints(app, ref);
    const res = await app.request("/api/open", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

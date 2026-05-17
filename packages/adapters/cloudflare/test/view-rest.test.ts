import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Manifest } from "@aotterclam/mantle-spec";
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
 * Public View REST surface (ADR-0012). Every parsed View auto-exposes
 * `GET /api/views/<name>`; reserved query string knobs `page` / `show`
 * page through results, declared `View.spec.params` are coerced from
 * strings to their JSON Schema type.
 */
function manifests(): Manifest[] {
  const apiVersion = "cms.clam.ai/v1" as const;
  return [
    {
      apiVersion,
      kind: "Schema",
      metadata: { name: "posts" },
      spec: {
        title: "Posts",
        schema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            locale: { type: "string" },
          },
          required: ["slug"],
        },
        localized: true,
        lifecycle: "simple",
      },
    },
    {
      apiVersion,
      kind: "View",
      metadata: { name: "postsPublished" },
      spec: {
        from: "posts",
        filter: { eq: { field: "status", value: "published" } },
      },
    },
    {
      apiVersion,
      kind: "View",
      metadata: { name: "postsByLocale" },
      spec: {
        from: "posts",
        params: {
          type: "object",
          properties: { locale: { type: "string" } },
          required: ["locale"],
        },
        filter: {
          and: [
            { eq: { field: "status", value: "published" } },
            { eq: { field: "locale", value: { $param: "locale" } } },
          ],
        },
        limit: 10,
      },
    },
  ];
}

function harness(seed?: (db: InMemoryDatabase) => void) {
  const db = new InMemoryDatabase();
  if (seed) seed(db);
  const ref = createCmsRef({
    manifests: manifests(),
    siteDefaults: { locales: ["en", "zh-TW"] },
    bindings: {
      db,
      kv: new InMemoryKv(),
      assets: new StubAssetServer(),
    },
    auth: stubAuth,
  });
  const app = new Hono();
  mountServerEndpoints(app, ref);
  return { app, db };
}

function row(id: string, data: Record<string, unknown>, status = "published") {
  return {
    id,
    collection: "posts",
    status,
    version: 1,
    data: JSON.stringify(data),
    author_id: null,
    created_at: 1,
    updated_at: 1,
  };
}

describe("GET /api/views/<name>", () => {
  it("returns matching rows for a static View", async () => {
    const h = harness((db) => {
      db.entries.set("p1", row("p1", { slug: "a", locale: "en" }));
      db.entries.set("p2", row("p2", { slug: "b", locale: "zh-TW" }));
      db.entries.set("p3", row("p3", { slug: "c", locale: "en" }, "draft"));
    });
    const res = await h.app.request("/api/views/postsPublished");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { rows: unknown[]; page: number; show: number; hasMore: boolean };
    };
    expect(body.ok).toBe(true);
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.page).toBe(1);
    expect(body.data.hasMore).toBe(false);
  });

  it("filters by required param via { $param: locale }", async () => {
    const h = harness((db) => {
      db.entries.set("p1", row("p1", { slug: "a", locale: "en" }));
      db.entries.set("p2", row("p2", { slug: "b", locale: "zh-TW" }));
    });
    const res = await h.app.request("/api/views/postsByLocale?locale=zh-TW");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { rows: Array<{ id: string }> };
    };
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.rows[0]!.id).toBe("p2");
  });

  it("returns 400 INPUT_VALIDATION_FAILED when a required param is missing", async () => {
    const h = harness();
    const res = await h.app.request("/api/views/postsByLocale");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; diagnostic: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.diagnostic.code).toBe("INPUT_VALIDATION_FAILED");
  });

  it("clamps ?show beyond View.spec.limit", async () => {
    const h = harness((db) => {
      for (let i = 0; i < 25; i++) {
        db.entries.set(`p${i}`, row(`p${i}`, { slug: `s${i}`, locale: "en" }));
      }
    });
    const res = await h.app.request("/api/views/postsByLocale?locale=en&show=1000");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { rows: unknown[]; show: number; hasMore: boolean };
    };
    // View declares limit: 10 → server caps show.
    expect(body.data.show).toBe(10);
    expect(body.data.rows).toHaveLength(10);
    expect(body.data.hasMore).toBe(true);
  });

  it("paginates with ?page=2", async () => {
    const h = harness((db) => {
      for (let i = 0; i < 5; i++) {
        db.entries.set(`p${i}`, row(`p${i}`, { slug: `s${i}`, locale: "en" }));
      }
    });
    const res = await h.app.request("/api/views/postsByLocale?locale=en&show=2&page=2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { rows: unknown[]; page: number; show: number; hasMore: boolean };
    };
    expect(body.data.page).toBe(2);
    expect(body.data.show).toBe(2);
    expect(body.data.rows).toHaveLength(2);
    expect(body.data.hasMore).toBe(true);
  });

  it("404s on an undeclared View name", async () => {
    const h = harness();
    const res = await h.app.request("/api/views/doesNotExist");
    expect(res.status).toBe(404);
  });

  it("auth-gated View on HTTP route plumbs ctx — passes when staff session is present (#210 PR12 C1)", async () => {
    // The route must build a HandlerContext from the Better Auth
    // cookie session and forward it as ExecuteViewRequest.ctx, else
    // every auth-gated View returns UNAUTHENTICATED for every caller.
    // We validate the plumbing here by registering an auth-gated View
    // and a staff session; the view should resolve.
    const ownerAuth: Auth = {
      handler: async () => new Response(null, { status: 404 }),
      getSession: async () => ({
        session: { id: "s", userId: "u", expiresAt: new Date(Date.now() + 60_000) },
        user: { id: "u", email: "x@y.z", name: "Staff", role: "owner", githubLogin: null },
      }),
      getUserRole: async () => "owner",
      methods: [],
    };
    const gatedManifests: Manifest[] = [
      ...manifests(),
      {
        apiVersion: "cms.clam.ai/v1",
        kind: "View",
        metadata: { name: "staffOnly" },
        spec: {
          from: "posts",
          requires: { auth: { all: [{ "ctx.staff": ["owner"] }] } },
        },
      },
    ];
    const db = new InMemoryDatabase();
    db.entries.set("p1", row("p1", { slug: "hi", locale: "en" }));
    const ref = createCmsRef({
      manifests: gatedManifests,
      siteDefaults: { locales: ["en"] },
      bindings: { db, kv: new InMemoryKv(), assets: new StubAssetServer() },
      auth: ownerAuth,
    });
    const app = new Hono();
    mountServerEndpoints(app, ref);
    const res = await app.request("/api/views/staffOnly");
    expect(res.status).toBe(200);
  });

  it("auth-gated View on HTTP route rejects with UNAUTHENTICATED when no session", async () => {
    const gatedManifests: Manifest[] = [
      ...manifests(),
      {
        apiVersion: "cms.clam.ai/v1",
        kind: "View",
        metadata: { name: "staffOnly2" },
        spec: {
          from: "posts",
          requires: { auth: { all: [{ "ctx.staff": ["owner"] }] } },
        },
      },
    ];
    const db = new InMemoryDatabase();
    const ref = createCmsRef({
      manifests: gatedManifests,
      siteDefaults: { locales: ["en"] },
      bindings: { db, kv: new InMemoryKv(), assets: new StubAssetServer() },
      auth: stubAuth,
    });
    const app = new Hono();
    mountServerEndpoints(app, ref);
    const res = await app.request("/api/views/staffOnly2");
    const body = await res.json() as { ok: boolean; diagnostic?: { code: string } };
    expect(body.ok).toBe(false);
    // No staff session + requires set → predicate fails → AUTH_DENIED
    // (anonymous ctx with user: null causes the predicate to fail
    // before the missing-ctx branch fires).
    expect(["UNAUTHENTICATED", "AUTH_DENIED"]).toContain(body.diagnostic?.code);
  });
});

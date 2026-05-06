import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Manifest } from "@aotterclam/clam-cms-spec";
import { TemplateRegistry } from "@aotterclam/clam-cms-runtime";
import { createCmsRef } from "../src/mount/bootRuntimeOnce.js";
import { mountPublicRoutes } from "../src/mount/mountPublicRoutes.js";
import { StubOAuthVerifier } from "../src/bindings/StubOAuthVerifier.js";
import { InMemoryDatabase } from "../../clam-cms-runtime/test/fakes/database.js";
import {
  InMemoryKv,
  StubAssetServer,
  StubSessionRepository,
  StubStaffRepository,
  StubUserRepository,
} from "./fakes/runtime-bindings.js";

function manifests(): Manifest[] {
  return [
    {
      apiVersion: "cms.clam.ai/v1",
      kind: "Schema",
      metadata: { name: "posts" },
      spec: {
        title: "Posts",
        schema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            locale: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
          },
          required: ["slug", "locale", "title"],
        },
        localized: true,
        lifecycle: "simple",
      },
    },
  ];
}

function harness() {
  const db = new InMemoryDatabase();
  const kv = new InMemoryKv();
  const templates = new TemplateRegistry();
  templates.registerEntryTemplate("posts", ({ entry, site }) => `<article data-brand="${site.brand}"><h1>${entry.data["title"]}</h1></article>`);
  templates.registerListTemplate("posts", ({ entries, site }) => `<section data-brand="${site.brand}">${entries.map((e) => e.data["title"]).join(",")}</section>`);
  const ref = createCmsRef({
    manifests: manifests(),
    templates,
    siteDefaults: {
      title: "Blog",
      brand: "Blog",
      origin: "https://example.com",
      locales: ["en"],
    },
    bindings: {
      db,
      kv,
      sessions: new StubSessionRepository(),
      users: new StubUserRepository(),
      staff: new StubStaffRepository(),
      assets: new StubAssetServer(),
      oauth: new StubOAuthVerifier({ CLAM_ALLOW_STUB_OAUTH: "1" }),
    },
  });
  const app = new Hono();
  mountPublicRoutes(app, ref, {
    collectionRoutes: [{ collection: "posts", segment: "posts", listRoute: true }],
    notFoundRenderer: async () => new Response("missing", { status: 404 }),
  });
  return { app, db, kv };
}

function seedPublishedPost(db: InMemoryDatabase): void {
  db.entries.set("p1", {
    id: "p1",
    collection: "posts",
    status: "published",
    version: 1,
    data: JSON.stringify({
      slug: "hello",
      locale: "en",
      title: "Hello",
      body: "World",
    }),
    author_id: null,
    created_at: 1,
    updated_at: 2,
  });
}

describe("mountPublicRoutes read-through cache", () => {
  it("renders list HTML from D1 on KV miss and populates KV", async () => {
    const h = harness();
    seedPublishedPost(h.db);

    const res = await h.app.request("/en/posts");
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain("<section data-brand=\"Blog\">Hello</section>");
    await expect(h.kv.get("list:html:en/posts")).resolves.toContain("<section data-brand=\"Blog\">Hello</section>");
  });

  it("renders entry HTML from D1 on KV miss and populates KV", async () => {
    const h = harness();
    seedPublishedPost(h.db);

    const res = await h.app.request("/en/posts/hello");
    expect(res.status).toBe(200);
    await expect(res.text()).resolves.toContain("<h1>Hello</h1>");
    await expect(h.kv.get("entry:html:en/posts/hello")).resolves.toContain("<h1>Hello</h1>");
  });

  it("uses operator-edited site_config for read-through renders", async () => {
    const h = harness();
    h.db.siteConfig.set("brand", "Operator Brand");
    seedPublishedPost(h.db);

    const list = await h.app.request("/en/posts");
    expect(list.status).toBe(200);
    await expect(list.text()).resolves.toContain("data-brand=\"Operator Brand\"");

    const entry = await h.app.request("/en/posts/hello");
    expect(entry.status).toBe(200);
    await expect(entry.text()).resolves.toContain("data-brand=\"Operator Brand\"");
  });

  it("renders markdown from D1 on KV miss and populates KV", async () => {
    const h = harness();
    seedPublishedPost(h.db);

    const res = await h.app.request("/en/posts/hello.md");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("# Hello");
    expect(body).toContain("World");
    await expect(h.kv.get("entry:md:en/posts/hello")).resolves.toContain("# Hello");
  });

  it("returns 404 without populating KV when D1 has no published entry", async () => {
    const h = harness();

    const res = await h.app.request("/en/posts/ghost");
    expect(res.status).toBe(404);
    await expect(h.kv.get("entry:html:en/posts/ghost")).resolves.toBeNull();
  });
});

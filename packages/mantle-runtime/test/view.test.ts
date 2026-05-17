import { describe, expect, it } from "vitest";
import { compileView } from "../src/domain/service/ViewSqlCompiler.js";
import { ExecuteViewUseCase } from "../src/usecase/view/ExecuteViewUseCase.js";
import { InMemoryDatabase } from "./fakes/database.js";
import type { ViewManifest } from "@aotter/mantle-spec";

function view(opts: Partial<ViewManifest["spec"]> & { from: string }): ViewManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "View",
    metadata: { name: "v" },
    spec: opts,
  };
}

describe("compileView", () => {
  it("emits a default-projection SELECT for a bare from-only view", () => {
    const c = compileView(view({ from: "posts" }));
    expect(c.sql).toContain("FROM entries WHERE collection = ?");
    expect(c.sql).toContain("LIMIT");
    expect(c.params).toEqual(["posts"]);
  });

  it("compiles `eq` filter with parameter binding", () => {
    const c = compileView(
      view({ from: "posts", filter: { eq: { field: "status", value: "published" } } }),
    );
    expect(c.params).toEqual(["posts", "published"]);
    expect(c.sql).toMatch(/status = \?/);
  });

  it("non-reserved field uses json_extract", () => {
    const c = compileView(
      view({
        from: "posts",
        filter: { eq: { field: "locale", value: "en-US" } },
      }),
    );
    expect(c.sql).toContain(`json_extract(data, '$."locale"') = ?`);
  });

  it("compiles `and` of multiple eqs", () => {
    const c = compileView(
      view({
        from: "posts",
        filter: {
          and: [
            { eq: { field: "status", value: "published" } },
            { eq: { field: "locale", value: "en-US" } },
          ],
        },
      }),
    );
    expect(c.params).toEqual(["posts", "published", "en-US"]);
    expect(c.sql).toMatch(/AND/);
  });

  it("orderBy + limit compile through", () => {
    const c = compileView(
      view({
        from: "posts",
        orderBy: [{ field: "updatedAt", direction: "desc" }],
        limit: 5,
      }),
    );
    expect(c.sql).toMatch(/ORDER BY updated_at DESC/);
    expect(c.sql).toMatch(/LIMIT 5 OFFSET 0/);
  });

  it("substitutes filter param-ref sentinels from the resolved params map", () => {
    const c = compileView(
      view({
        from: "posts",
        params: {
          type: "object",
          properties: { locale: { type: "string" } },
          required: ["locale"],
        },
        filter: { eq: { field: "locale", value: { $param: "locale" } } },
      }),
      { params: { locale: "zh-TW" } },
    );
    expect(c.params).toEqual(["posts", "zh-TW"]);
    expect(c.sql).toContain(`json_extract(data, '$."locale"') = ?`);
  });

  it("drops a filter eq whose param-ref resolves to undefined (forward-compat for v0.1.x optional)", () => {
    const c = compileView(
      view({
        from: "posts",
        filter: {
          and: [
            { eq: { field: "status", value: "published" } },
            { eq: { field: "locale", value: { $param: "locale" } } },
          ],
        },
      }),
      { params: {} },
    );
    expect(c.params).toEqual(["posts", "published"]);
    expect(c.sql).not.toContain("locale");
  });

  it("partial-drop in nested AND keeps params bound 1:1 with `?` placeholders", () => {
    // Regression: compileFilter now returns {sql, params} per node so
    // dropped sub-trees can never push orphan params into the parent.
    const c = compileView(
      view({
        from: "posts",
        params: {
          type: "object",
          properties: { tag: { type: "string" } },
          required: ["tag"],
        },
        filter: {
          and: [
            { eq: { field: "status", value: "published" } },
            {
              and: [
                { eq: { field: "locale", value: "en-US" } },
                { eq: { field: "tag", value: { $param: "tag" } } },
              ],
            },
          ],
        },
      }),
      { params: {} },
    );
    expect(c.params).toEqual(["posts", "published", "en-US"]);
    const placeholders = (c.sql.match(/\?/g) ?? []).length;
    expect(placeholders).toBe(3);
  });

  it("accepts hyphenated field names via quoted JSON paths (#210 PR14 / codex CX3)", () => {
    // Schema property keys are arbitrary JSON strings per RFC 8259;
    // the prior identifier-only allowlist rejected legitimate
    // manifests at query time. Now we always quote the path + alias.
    const c = compileView(
      view({
        from: "posts",
        fields: ["hero-image"],
        filter: { eq: { field: "hero-image", value: "x" } },
      }),
    );
    expect(c.sql).toContain(`json_extract(data, '$."hero-image"')`);
    expect(c.sql).toMatch(/AS "hero-image"/);
    expect(c.params).toEqual(["posts", "x"]);
  });

  it("safely escapes single quotes in field names without rejecting them", () => {
    // Outer SQL literal uses `'...'` so inner `'` doubles to `''`;
    // the field still resolves to the original key at JSON path time.
    const c = compileView(
      view({
        from: "posts",
        filter: { eq: { field: `foo'bar`, value: "x" } },
      }),
    );
    expect(c.sql).toContain(`json_extract(data, '$."foo''bar"')`);
    expect(c.params).toEqual(["posts", "x"]);
  });

  it("rejects field names containing `\"`, `\\`, or NUL (SQLite JSON path can't resolve them)", () => {
    // SQLite JSON1 path syntax `$."key"` has no documented escape for
    // an inner `"` or `\`. Codex CX3 follow-up: previously this PR
    // tried to escape via doubling but SQLite returns NULL for such
    // paths. Reject instead — Schema authors don't write these.
    for (const bad of [`foo"bar`, `foo\\bar`, "foo\0bar"]) {
      expect(() =>
        compileView(
          view({ from: "posts", filter: { eq: { field: bad, value: "x" } } }),
        ),
      ).toThrow(/unrepresentable character|NUL|"|\\/);
    }
  });

  it("emits no WHERE filter when every filter clause drops", () => {
    const c = compileView(
      view({
        from: "posts",
        filter: { eq: { field: "tag", value: { $param: "tag" } } },
      }),
      { params: {} },
    );
    expect(c.params).toEqual(["posts"]);
    expect(c.sql).toMatch(/WHERE collection = \? ORDER BY|WHERE collection = \? LIMIT/);
  });

  it("clamps caller-supplied show to View.spec.limit (server-enforced cap)", () => {
    const c = compileView(view({ from: "posts", limit: 10 }), { show: 1000 });
    expect(c.effectiveShow).toBe(10);
    expect(c.sql).toMatch(/LIMIT 10 OFFSET 0/);
  });

  it("page=2 emits OFFSET = (page-1) * show", () => {
    const c = compileView(view({ from: "posts", limit: 20 }), { page: 2, show: 5 });
    expect(c.effectivePage).toBe(2);
    expect(c.effectiveShow).toBe(5);
    expect(c.sql).toMatch(/LIMIT 5 OFFSET 5/);
  });

  it("page < 1 falls back to page=1", () => {
    const c = compileView(view({ from: "posts" }), { page: 0 });
    expect(c.effectivePage).toBe(1);
  });
});

describe("ExecuteViewUseCase", () => {
  it("returns published entries for a status=published filter", async () => {
    const db = new InMemoryDatabase();
    db.entries.set("p1", {
      id: "p1",
      collection: "posts",
      status: "published",
      version: 1,
      data: JSON.stringify({ title: "Hi" }),
      author_id: null,
      created_at: 1,
      updated_at: 2,
    });
    db.entries.set("p2", {
      id: "p2",
      collection: "posts",
      status: "draft",
      version: 1,
      data: JSON.stringify({ title: "Drafty" }),
      author_id: null,
      created_at: 1,
      updated_at: 3,
    });
    const useCase = new ExecuteViewUseCase(db);
    const result = await useCase.execute({
      view: view({
        from: "posts",
        filter: { eq: { field: "status", value: "published" } },
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.rows).toHaveLength(1);
    expect((result.result.rows[0] as { id: string }).id).toBe("p1");
    expect(result.result.page).toBe(1);
    expect(result.result.hasMore).toBe(false);
  });

  it("rejects an auth-gated View when ctx is missing (UNAUTHENTICATED)", async () => {
    const db = new InMemoryDatabase();
    const useCase = new ExecuteViewUseCase(db);
    const result = await useCase.execute({
      view: view({
        from: "posts",
        requires: { auth: { all: ["ctx.user"] } },
      }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("UNAUTHENTICATED");
  });

  it("denies an auth-gated View when the predicate fails (AUTH_DENIED)", async () => {
    const db = new InMemoryDatabase();
    const useCase = new ExecuteViewUseCase(db);
    const result = await useCase.execute({
      view: view({
        from: "posts",
        requires: { auth: { all: [{ "ctx.staff": ["owner"] }] } },
      }),
      ctx: {
        user: { id: "u1" },
        staff: null,
        env: {},
        request: new Request("https://example.com/"),
        waitUntil: () => {},
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe("AUTH_DENIED");
  });

  it("allows an auth-gated View when the staff role matches", async () => {
    const db = new InMemoryDatabase();
    db.entries.set("p1", {
      id: "p1",
      collection: "posts",
      status: "published",
      version: 1,
      data: JSON.stringify({ title: "Hi" }),
      author_id: null,
      created_at: 1,
      updated_at: 2,
    });
    const useCase = new ExecuteViewUseCase(db);
    const result = await useCase.execute({
      view: view({
        from: "posts",
        requires: { auth: { all: [{ "ctx.staff": ["owner"] }] } },
      }),
      ctx: {
        user: { id: "u1" },
        staff: { id: "u1", role: "owner" },
        env: {},
        request: new Request("https://example.com/"),
        waitUntil: () => {},
      },
    });
    expect(result.ok).toBe(true);
  });

  it("hasMore=true when result fills the requested page exactly", async () => {
    const db = new InMemoryDatabase();
    for (let i = 1; i <= 4; i++) {
      db.entries.set(`p${i}`, {
        id: `p${i}`,
        collection: "posts",
        status: "published",
        version: 1,
        data: JSON.stringify({ title: `t${i}` }),
        author_id: null,
        created_at: i,
        updated_at: i,
      });
    }
    const useCase = new ExecuteViewUseCase(db);
    const result = await useCase.execute({
      view: view({ from: "posts" }),
      options: { show: 2 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.result.rows).toHaveLength(2);
    expect(result.result.hasMore).toBe(true);
  });
});

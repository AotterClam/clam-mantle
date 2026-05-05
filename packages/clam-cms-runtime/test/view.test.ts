import { describe, expect, it } from "vitest";
import { compileView } from "../src/domain/service/ViewSqlCompiler.js";
import { ExecuteViewUseCase } from "../src/usecase/view/ExecuteViewUseCase.js";
import { InMemoryDatabase } from "./fakes/database.js";
import type { ViewManifest } from "@aotterclam/clam-cms-spec";

function view(opts: Partial<ViewManifest["spec"]> & { from: string }): ViewManifest {
  return {
    apiVersion: "cms.clam.ai/v1",
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
    expect(c.sql).toContain(`json_extract(data, '$.locale') = ?`);
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
    expect(c.sql).toContain(`json_extract(data, '$.locale') = ?`);
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

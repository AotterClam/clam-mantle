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
    expect(c.sql).toMatch(/LIMIT 5/);
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
    expect(result.result.items).toHaveLength(1);
    expect((result.result.items[0] as { id: string }).id).toBe("p1");
  });
});

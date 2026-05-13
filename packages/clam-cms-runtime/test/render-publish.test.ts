import { describe, expect, it } from "vitest";
import { HtmlPublishOrchestrator } from "../src/infrastructure/render/HtmlPublishOrchestrator.js";
import { ComposeEntrySeoMetaUseCase } from "../src/usecase/render/ComposeEntrySeoMetaUseCase.js";
import {
  entryHtmlKey,
  entryMarkdownKey,
  listHtmlKey,
  llmsTxtKey,
} from "../src/domain/service/PublishKeys.js";
import { TemplateRegistry } from "../src/domain/model/TemplateRegistry.js";
import { InMemoryDatabase } from "./fakes/database.js";
import { InMemoryKv } from "./fakes/kv.js";
import type { SiteConfig } from "@aotterclam/clam-cms-spec";

const site: SiteConfig = {
  title: "Blog",
  description: "",
  origin: "https://example.com",
  locales: [],
  canonicalLocale: null,
  brand: "Blog",
};

function seedEntry(
  db: InMemoryDatabase,
  args: { id: string; data: Record<string, unknown>; updated_at?: number },
): void {
  db.entries.set(args.id, {
    id: args.id,
    collection: "posts",
    status: "published",
    version: 1,
    data: JSON.stringify(args.data),
    author_id: null,
    created_at: 1,
    updated_at: args.updated_at ?? 2,
  });
}

describe("HtmlPublishOrchestrator", () => {
  it("writes entry HTML, .md, list HTML, and llms.txt to KV", async () => {
    const db = new InMemoryDatabase();
    const kv = new InMemoryKv();
    seedEntry(db, { id: "p1", data: { title: "Hi", slug: "hi", content: "Hello." } });
    const templates = new TemplateRegistry();
    templates.registerEntryTemplate(
      "posts",
      ({ entry }) => `<h1>${entry.data["title"] as string}</h1>`,
    );
    templates.registerListTemplate("posts", ({ entries }) => `<ul>${entries.length}</ul>`);

    const orchestrator = new HtmlPublishOrchestrator(db, kv, null, new ComposeEntrySeoMetaUseCase(db), new Map());
    await orchestrator.publish({ entryId: "p1", site, templates });

    const snap = kv._snapshot();
    expect(
      snap.get(entryHtmlKey({ id: "p1", collection: "posts", status: "published", version: 1, data: { slug: "hi" }, createdAt: 1, updatedAt: 2 })),
    ).toContain("<h1>Hi</h1>");
    const md = snap.get(
      entryMarkdownKey({
        id: "p1", collection: "posts", status: "published", version: 1, data: { slug: "hi" }, createdAt: 1, updatedAt: 2,
      }),
    );
    expect(md).toContain("# Hi");
    expect(md).toContain("Hello.");
    expect(snap.get(listHtmlKey("posts", ""))).toContain("<ul>1</ul>");
    expect(snap.get(llmsTxtKey(""))).toContain("[Hi](https://example.com/posts/hi.md)");
  });

  it("throws NOT_FOUND for unknown entry id", async () => {
    const db = new InMemoryDatabase();
    const kv = new InMemoryKv();
    const orchestrator = new HtmlPublishOrchestrator(db, kv, null, new ComposeEntrySeoMetaUseCase(db), new Map());
    await expect(
      orchestrator.publish({
        entryId: "ghost",
        site,
        templates: new TemplateRegistry(),
      }),
    ).rejects.toMatchObject({ diagnostic: { code: "NOT_FOUND" } });
  });

  it("unpublish removes entry blobs and rewrites derived list/llms caches", async () => {
    const db = new InMemoryDatabase();
    const kv = new InMemoryKv();
    seedEntry(db, { id: "p1", data: { title: "Hi", slug: "hi", content: "Hello." } });
    const templates = new TemplateRegistry();
    templates.registerEntryTemplate("posts", ({ entry }) => `<h1>${entry.data["title"] as string}</h1>`);
    templates.registerListTemplate("posts", ({ entries }) => `<ul>${entries.length}</ul>`);

    const orchestrator = new HtmlPublishOrchestrator(db, kv, null, new ComposeEntrySeoMetaUseCase(db), new Map());
    await orchestrator.publish({ entryId: "p1", site, templates });
    db.entries.set("p1", {
      ...db.entries.get("p1")!,
      status: "draft",
      version: 2,
      updated_at: 3,
    });
    await orchestrator.unpublish({ entryId: "p1", site, templates });

    const snap = kv._snapshot();
    expect(
      snap.get(entryHtmlKey({ id: "p1", collection: "posts", status: "draft", version: 2, data: { slug: "hi" }, createdAt: 1, updatedAt: 3 })),
    ).toBeUndefined();
    expect(
      snap.get(entryMarkdownKey({ id: "p1", collection: "posts", status: "draft", version: 2, data: { slug: "hi" }, createdAt: 1, updatedAt: 3 })),
    ).toBeUndefined();
    expect(snap.get(listHtmlKey("posts", ""))).toContain("<ul>0</ul>");
    expect(snap.get(llmsTxtKey(""))).not.toContain("Hi");
  });
});

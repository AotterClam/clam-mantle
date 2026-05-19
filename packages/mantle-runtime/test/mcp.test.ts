import { describe, expect, it } from "vitest";
import {
  McpJsonRpcDispatcher,
  type McpUseCases,
} from "../src/infrastructure/mcp/McpJsonRpcDispatcher.js";
import {
  ArchiveUseCase,
  CreateDraftUseCase,
  DeleteEntryUseCase,
  GetEntryUseCase,
  ListEntriesUseCase,
  RequestPublishUseCase,
  UnpublishUseCase,
  UpdateDraftUseCase,
} from "../src/usecase/content/index.js";
import type { Clock } from "../src/domain/port/Clock.js";
import type { IdGenerator } from "../src/domain/port/IdGenerator.js";
import { TemplateRegistry } from "../src/domain/model/TemplateRegistry.js";
import { InMemoryEntryRepository } from "./fakes/in-memory-store.js";
import { postsSchema, recentPostsView } from "./fakes/manifests.js";

interface Harness {
  store: InMemoryEntryRepository;
  dispatcher: McpJsonRpcDispatcher;
  publishCalls: string[];
  unpublishCalls: string[];
}

function buildHarness(schemas = [postsSchema()]): Harness {
  const store = new InMemoryEntryRepository();
  const schemasByName = new Map(schemas.map((s) => [s.metadata.name, s]));
  let i = 1;
  const clock: Clock = { now: () => 1_000_000 };
  const idgen: IdGenerator = { next: () => `mcp-${i++}` };
  const publishCalls: string[] = [];
  const unpublishCalls: string[] = [];
  const templates = new TemplateRegistry();
  const effects = {
    templates,
    siteConfig: {
      load: async () => ({
        title: "Test",
        brand: "Test",
        description: "",
        origin: "https://example.com",
        locales: ["en"],
        canonicalLocale: "en",
      }),
    },
    publishOrchestrator: {
      publish: async ({ entryId }: { entryId: string }) => {
        publishCalls.push(entryId);
      },
      unpublish: async ({ entryId }: { entryId: string }) => {
        unpublishCalls.push(entryId);
      },
    },
  };
  const useCases: McpUseCases = {
    listEntries: new ListEntriesUseCase(store, schemasByName),
    getEntry: new GetEntryUseCase(store),
    createDraft: new CreateDraftUseCase(store, schemasByName, clock, idgen),
    updateDraft: new UpdateDraftUseCase(store, schemasByName, clock),
    requestPublish: new RequestPublishUseCase(store, schemasByName, clock, effects),
    unpublish: new UnpublishUseCase(store, schemasByName, clock, effects),
    archive: new ArchiveUseCase(store, schemasByName, clock, effects),
    deleteEntry: new DeleteEntryUseCase(store),
  };
  return {
    store,
    dispatcher: new McpJsonRpcDispatcher(useCases, schemas),
    publishCalls,
    unpublishCalls,
  };
}

function jsonRpcReq(method: string, params?: unknown, id: number | string = 1): Request {
  return new Request("https://example.com/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

describe("McpJsonRpcDispatcher", () => {
  it("initialize returns protocol info", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(jsonRpcReq("initialize"), { userId: "u1" });
    const body = (await res.json()) as { result: { protocolVersion: string } };
    expect(body.result.protocolVersion).toBe("2025-03-26");
  });

  it("tools/list emits generic + per-collection tools", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(jsonRpcReq("tools/list"), { userId: "u1" });
    const body = (await res.json()) as {
      result: { tools: { name: string }[] };
    };
    const names = body.result.tools.map((t) => t.name);
    // Generic read/status tools.
    expect(names).toContain("list_entries");
    expect(names).toContain("get_entry");
    expect(names).toContain("request_publish");
    expect(names).toContain("unpublish_entry");
    expect(names).toContain("archive_entry");
    // Per-collection authoring tools.
    expect(names).toContain("create_draft_posts");
    expect(names).toContain("update_draft_posts");
    // Old generic create_draft is gone.
    expect(names).not.toContain("create_draft");
  });

  it("public surface exposes View query tools, not staff authoring tools", async () => {
    const { dispatcher: _staff, ...h } = buildHarness();
    const dispatcher = new McpJsonRpcDispatcher(
      {
        listEntries: new ListEntriesUseCase(h.store, new Map([["posts", postsSchema()]])),
        getEntry: new GetEntryUseCase(h.store),
        createDraft: new CreateDraftUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }, { next: () => "x" }),
        updateDraft: new UpdateDraftUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        requestPublish: new RequestPublishUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        unpublish: new UnpublishUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        archive: new ArchiveUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        deleteEntry: new DeleteEntryUseCase(h.store),
      },
      [postsSchema()],
      {
        surface: "public",
        views: [recentPostsView()],
      },
    );
    const res = await dispatcher.dispatch(jsonRpcReq("tools/list"), { userId: "u1", staff: null });
    const body = (await res.json()) as {
      result: { tools: { name: string }[] };
    };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toEqual(["query_view_recent_posts"]);
  });

  it("tools/list preserves media x-mcp-hint metadata for agents", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(jsonRpcReq("tools/list"), { userId: "u1" });
    const body = (await res.json()) as {
      result: {
        tools: Array<{
          name: string;
          inputSchema: { properties?: Record<string, Record<string, unknown>> };
        }>;
      };
    };
    const createPosts = body.result.tools.find((t) => t.name === "create_draft_posts");
    expect(createPosts?.inputSchema.properties?.coverUrl?.["x-mcp-hint"]).toBe("media-image");
  });

  it("tools/list marks media purpose required and exposes declared purpose enum", async () => {
    const { dispatcher: _unused, ...h } = buildHarness();
    const dispatcher = new McpJsonRpcDispatcher(
      {
        listEntries: new ListEntriesUseCase(h.store, new Map([["posts", postsSchema()]])),
        getEntry: new GetEntryUseCase(h.store),
        createDraft: new CreateDraftUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }, { next: () => "x" }),
        updateDraft: new UpdateDraftUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        requestPublish: new RequestPublishUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        unpublish: new UnpublishUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        archive: new ArchiveUseCase(h.store, new Map([["posts", postsSchema()]]), { now: () => 0 }),
        deleteEntry: new DeleteEntryUseCase(h.store),
        media: {
          createUpload: { execute: async () => ({}) } as never,
          commitUpload: { execute: async () => ({}) } as never,
          purposes: ["post-cover", "product-gallery"],
        },
      },
      [postsSchema()],
    );
    const res = await dispatcher.dispatch(jsonRpcReq("tools/list"), { userId: "u1" });
    const body = (await res.json()) as {
      result: {
        tools: Array<{
          name: string;
          inputSchema: {
            required?: string[];
            properties?: Record<string, Record<string, unknown>>;
          };
        }>;
      };
    };
    const mediaTool = body.result.tools.find((t) => t.name === "create_media_upload");
    expect(mediaTool?.inputSchema.required).toContain("purpose");
    expect(mediaTool?.inputSchema.properties?.purpose?.enum).toEqual([
      "post-cover",
      "product-gallery",
    ]);
  });

  it("tools/call create_draft_posts creates an entry through the use case", async () => {
    const { dispatcher, store } = buildHarness();
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "create_draft_posts",
        // Per-collection tool: agent sends Schema fields at top level
        // (no `{ data: ... }` wrapper).
        arguments: { title: "From MCP" },
      }),
      { userId: "u1" },
    );
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    const created = JSON.parse(body.result.content[0]!.text) as { id: string };
    expect(await store.get(created.id)).toMatchObject({
      data: { title: "From MCP" },
      authorId: "u1",
    });
  });

  it("tools/call request_publish flips draft → published", async () => {
    const { dispatcher, store, publishCalls } = buildHarness();
    const created = await store.create({
      id: "p1",
      collection: "posts",
      status: "draft",
      data: { title: "x" },
      authorId: "u1",
      now: 0,
    });
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "request_publish",
        arguments: { id: created.id },
      }),
      { userId: "u1" },
    );
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    const result = JSON.parse(body.result.content[0]!.text) as { status: string };
    expect(result.status).toBe("published");
    expect(publishCalls).toEqual([created.id]);
  });

  it("tools/call unpublish_entry flips published → draft", async () => {
    const { dispatcher, store, unpublishCalls } = buildHarness();
    const created = await store.create({
      id: "p1",
      collection: "posts",
      status: "published",
      data: { title: "x" },
      authorId: "u1",
      now: 0,
    });
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "unpublish_entry",
        arguments: { id: created.id },
      }),
      { userId: "u1" },
    );
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    const result = JSON.parse(body.result.content[0]!.text) as { status: string };
    expect(result.status).toBe("draft");
    expect(unpublishCalls).toEqual([created.id]);
  });

  it("tools/call request_publish rejects orphan translated children", async () => {
    const { dispatcher } = buildHarness(translatedSchemas());
    const createdRes = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "create_draft_post_translations",
        arguments: { slug: "ghost", locale: "en", title: "Ghost", body: "Missing parent" },
      }),
      { userId: "u1" },
    );
    const createdBody = (await createdRes.json()) as { result: { content: { text: string }[] } };
    const created = JSON.parse(createdBody.result.content[0]!.text) as { id: string };

    const publishRes = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "request_publish",
        arguments: { id: created.id },
      }),
      { userId: "u1" },
    );
    const body = (await publishRes.json()) as {
      error: { code: number; data: { code: string; value: Record<string, unknown> } };
    };
    expect(body.error.code).toBe(-32000);
    expect(body.error.data.code).toBe("TRANSLATES_PARENT_UNKNOWN");
    expect(body.error.data.value).toMatchObject({
      child: "post-translations",
      parent: "posts",
      field: "slug",
      value: "ghost",
    });
  });

  it("unknown tool returns -32601", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", { name: "ghost_tool", arguments: {} }),
      { userId: "u1" },
    );
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("create_draft_<unknown> returns -32601 unknown tool", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "create_draft_ghost",
        arguments: {},
      }),
      { userId: "u1" },
    );
    const body = (await res.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32601);
  });

  it("rejects non-POST methods", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(
      new Request("https://example.com/mcp", { method: "PUT" }),
      { userId: "u1" },
    );
    expect(res.status).toBe(405);
  });
});

function translatedSchemas() {
  const parent = postsSchema();
  return [
    parent,
    {
      apiVersion: "cms.mantle.aotter.net/v1" as const,
      kind: "Schema" as const,
      metadata: { name: "post-translations" },
      spec: {
        title: "Post translations",
        localized: true,
        translates: { parent: "posts", on: "slug" },
        schema: {
          type: "object" as const,
          properties: {
            slug: { type: "string" as const },
            locale: { type: "string" as const },
            title: { type: "string" as const },
            body: { type: "string" as const },
          },
          required: ["slug", "locale", "title", "body"],
        },
        lifecycle: "simple" as const,
      },
    },
  ];
}

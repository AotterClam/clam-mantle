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
import { InMemoryEntryRepository } from "./fakes/in-memory-store.js";
import { postsSchema } from "./fakes/manifests.js";

interface Harness {
  store: InMemoryEntryRepository;
  dispatcher: McpJsonRpcDispatcher;
}

function buildHarness(): Harness {
  const store = new InMemoryEntryRepository();
  const schemas = new Map([[postsSchema().metadata.name, postsSchema()]]);
  let i = 1;
  const clock: Clock = { now: () => 1_000_000 };
  const idgen: IdGenerator = { next: () => `mcp-${i++}` };
  const useCases: McpUseCases = {
    listEntries: new ListEntriesUseCase(store, schemas),
    getEntry: new GetEntryUseCase(store),
    createDraft: new CreateDraftUseCase(store, schemas, clock, idgen),
    updateDraft: new UpdateDraftUseCase(store, clock),
    requestPublish: new RequestPublishUseCase(store, schemas, clock),
    unpublish: new UnpublishUseCase(store, clock),
    archive: new ArchiveUseCase(store, schemas, clock),
    deleteEntry: new DeleteEntryUseCase(store),
  };
  return { store, dispatcher: new McpJsonRpcDispatcher(useCases) };
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

  it("tools/list emits the static catalog", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(jsonRpcReq("tools/list"), { userId: "u1" });
    const body = (await res.json()) as {
      result: { tools: { name: string }[] };
    };
    const names = body.result.tools.map((t) => t.name);
    expect(names).toContain("create_draft");
    expect(names).toContain("list_entries");
  });

  it("tools/call create_draft creates an entry through the use case", async () => {
    const { dispatcher, store } = buildHarness();
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "create_draft",
        arguments: { collection: "posts", data: { title: "From MCP" } },
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
    const { dispatcher, store } = buildHarness();
    const created = await store.create({
      id: "p1",
      collection: "posts",
      status: "draft",
      data: {},
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

  it("DiagnosticError surfaces in error.data", async () => {
    const { dispatcher } = buildHarness();
    const res = await dispatcher.dispatch(
      jsonRpcReq("tools/call", {
        name: "create_draft",
        arguments: { collection: "ghost", data: {} },
      }),
      { userId: "u1" },
    );
    const body = (await res.json()) as { error: { data: { code: string } } };
    expect(body.error.data.code).toBe("NOT_FOUND");
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

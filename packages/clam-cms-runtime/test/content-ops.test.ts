import { describe, expect, it } from "vitest";
import { DiagnosticError, type SchemaManifest } from "@aotterclam/clam-cms-spec";
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

const postsSchemaWithBindings: SchemaManifest = {
  ...postsSchema(),
  spec: {
    ...postsSchema().spec,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        slug: { type: "string" },
        authorId: { type: "string", "x-clam-bind": "ctx.user" },
        publishedAt: { type: "number", "x-clam-bind": "now" },
      },
      required: ["title"],
    },
  },
};

interface Harness {
  store: InMemoryEntryRepository;
  schemas: ReadonlyMap<string, SchemaManifest>;
  clock: Clock;
  idgen: IdGenerator;
  createDraft: CreateDraftUseCase;
  updateDraft: UpdateDraftUseCase;
  getEntry: GetEntryUseCase;
  listEntries: ListEntriesUseCase;
  requestPublish: RequestPublishUseCase;
  unpublish: UnpublishUseCase;
  archive: ArchiveUseCase;
  deleteEntry: DeleteEntryUseCase;
}

function harness(opts: { schemas?: ReadonlyMap<string, SchemaManifest> } = {}): Harness {
  const store = new InMemoryEntryRepository();
  const schemas = opts.schemas ?? new Map([[postsSchema().metadata.name, postsSchema()]]);
  let nextId = 1;
  const clock: Clock = { now: () => 1_000_000_000_000 };
  const idgen: IdGenerator = { next: () => `post-${nextId++}` };
  return {
    store,
    schemas,
    clock,
    idgen,
    createDraft: new CreateDraftUseCase(store, schemas, clock, idgen),
    updateDraft: new UpdateDraftUseCase(store, schemas, clock),
    getEntry: new GetEntryUseCase(store),
    listEntries: new ListEntriesUseCase(store, schemas),
    requestPublish: new RequestPublishUseCase(store, schemas, clock),
    unpublish: new UnpublishUseCase(store, clock),
    archive: new ArchiveUseCase(store, schemas, clock),
    deleteEntry: new DeleteEntryUseCase(store),
  };
}

describe("CreateDraftUseCase", () => {
  it("creates a row in 'draft' status with version=1", async () => {
    const h = harness();
    const row = await h.createDraft.execute({
      collection: "posts",
      data: { title: "Hello" },
      authorId: "user-1",
    });
    expect(row.status).toBe("draft");
    expect(row.version).toBe(1);
    expect(row.data).toEqual({ title: "Hello" });
    expect(await h.store.get(row.id)).toEqual(row);
  });

  it("rejects an unknown collection with NOT_FOUND", async () => {
    const h = harness();
    await expect(
      h.createDraft.execute({ collection: "ghost", data: {}, authorId: null }),
    ).rejects.toBeInstanceOf(DiagnosticError);
  });

  it("strips reserved metadata keys from caller-supplied data", async () => {
    const h = harness();
    const row = await h.createDraft.execute({
      collection: "posts",
      data: {
        title: "Hello",
        id: "spoofed-id",
        status: "published",
        version: 99,
        expectedVersion: 99,
        createdAt: 0,
        updatedAt: 0,
        authorId: "spoofed-author",
      },
      authorId: "user-1",
    });
    expect(row.id).not.toBe("spoofed-id");
    expect(row.status).toBe("draft");
    expect(row.version).toBe(1);
    expect(row.data).toEqual({ title: "Hello" });
  });

  it("projects Schema fields and stamps x-clam-bind values", async () => {
    const h = harness({
      schemas: new Map([[postsSchemaWithBindings.metadata.name, postsSchemaWithBindings]]),
    });
    const row = await h.createDraft.execute({
      collection: "posts",
      data: {
        title: "Hello",
        slug: "hello",
        unknown: "drop-me",
        authorId: "spoofed-author",
        publishedAt: 123,
      },
      authorId: "user-1",
    });
    expect(row.data).toEqual({
      title: "Hello",
      slug: "hello",
      authorId: "user-1",
      publishedAt: 1_000_000_000_000,
    });
  });
});

describe("UpdateDraftUseCase", () => {
  it("merges data and bumps version on a draft row", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "v1" },
      authorId: null,
    });
    const updated = await h.updateDraft.execute({
      id: created.id,
      expectedVersion: 1,
      data: { title: "v2", slug: "v2" },
    });
    expect(updated.data).toEqual({ title: "v2", slug: "v2" });
    expect(updated.version).toBe(2);
  });

  it("rejects update on non-draft entries", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    await h.requestPublish.execute({ id: created.id });
    await expect(
      h.updateDraft.execute({ id: created.id, expectedVersion: 2, data: { title: "y" } }),
    ).rejects.toMatchObject({ diagnostic: { code: "CONFLICT" } });
  });

  it("returns NOT_FOUND for unknown id", async () => {
    const h = harness();
    await expect(
      h.updateDraft.execute({ id: "missing", expectedVersion: 1, data: {} }),
    ).rejects.toMatchObject({ diagnostic: { code: "NOT_FOUND" } });
  });

  it("OCC mismatch raises CONFLICT", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    await expect(
      h.updateDraft.execute({ id: created.id, expectedVersion: 99, data: {} }),
    ).rejects.toMatchObject({ diagnostic: { code: "CONFLICT" } });
  });

  it("strips reserved metadata keys on update merge", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "v1" },
      authorId: null,
    });
    const updated = await h.updateDraft.execute({
      id: created.id,
      expectedVersion: 1,
      data: {
        title: "v2",
        id: "spoofed",
        status: "archived",
        version: 999,
        authorId: "evil",
      },
    });
    expect(updated.id).toBe(created.id);
    expect(updated.status).toBe("draft");
    expect(updated.version).toBe(2);
    expect(updated.data).toEqual({ title: "v2" });
  });

  it("preserves existing x-clam-bind values on update", async () => {
    const h = harness({
      schemas: new Map([[postsSchemaWithBindings.metadata.name, postsSchemaWithBindings]]),
    });
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "v1", slug: "v1" },
      authorId: "user-1",
    });
    const updated = await h.updateDraft.execute({
      id: created.id,
      expectedVersion: 1,
      data: {
        title: "v2",
        authorId: "spoofed-author",
        publishedAt: 123,
      },
    });
    expect(updated.data).toEqual({
      title: "v2",
      slug: "v1",
      authorId: "user-1",
      publishedAt: 1_000_000_000_000,
    });
  });
});

describe("RequestPublishUseCase (simple lifecycle)", () => {
  it("flips draft → published with status guard", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    const published = await h.requestPublish.execute({ id: created.id });
    expect(published.status).toBe("published");
    expect(published.version).toBe(2);
  });

  it("rejects already-published entries (illegal transition)", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    await h.requestPublish.execute({ id: created.id });
    await expect(h.requestPublish.execute({ id: created.id })).rejects.toBeInstanceOf(
      DiagnosticError,
    );
  });

  it("LIFECYCLE_NOT_IN_V010 if Schema is editorial", async () => {
    const editorialSchema: SchemaManifest = {
      ...postsSchema(),
      spec: { ...postsSchema().spec, lifecycle: "editorial" as const },
    };
    const h = harness({
      schemas: new Map([[editorialSchema.metadata.name, editorialSchema]]),
    });
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    await expect(h.requestPublish.execute({ id: created.id })).rejects.toMatchObject({
      diagnostic: { code: "LIFECYCLE_NOT_IN_V010" },
    });
  });
});

describe("UnpublishUseCase", () => {
  it("flips published back to draft", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    await h.requestPublish.execute({ id: created.id });
    const reverted = await h.unpublish.execute({ id: created.id });
    expect(reverted.status).toBe("draft");
  });

  it("rejects unpublish on draft (illegal transition)", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    await expect(h.unpublish.execute({ id: created.id })).rejects.toBeInstanceOf(
      DiagnosticError,
    );
  });
});

describe("ArchiveUseCase", () => {
  it("flips draft → archived (simple lifecycle allows direct archive)", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    const archived = await h.archive.execute({ id: created.id, expectedVersion: 1 });
    expect(archived.status).toBe("archived");
  });

  it("flips published → archived", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    const published = await h.requestPublish.execute({ id: created.id });
    const archived = await h.archive.execute({
      id: created.id,
      expectedVersion: published.version,
    });
    expect(archived.status).toBe("archived");
  });
});

describe("GetEntryUseCase / ListEntriesUseCase / DeleteEntryUseCase", () => {
  it("GetEntryUseCase returns the row when collection matches", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    const fetched = await h.getEntry.execute({ id: created.id, collection: "posts" });
    expect(fetched.id).toBe(created.id);
  });

  it("GetEntryUseCase rejects when collection asserted but doesn't match", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    await expect(
      h.getEntry.execute({ id: created.id, collection: "other" }),
    ).rejects.toMatchObject({ diagnostic: { code: "NOT_FOUND" } });
  });

  it("ListEntriesUseCase filters by status", async () => {
    const h = harness();
    const a = await h.createDraft.execute({ collection: "posts", data: {}, authorId: null });
    await h.createDraft.execute({ collection: "posts", data: {}, authorId: null });
    await h.requestPublish.execute({ id: a.id });
    const drafts = await h.listEntries.execute({ collection: "posts", status: "draft" });
    expect(drafts).toHaveLength(1);
    const published = await h.listEntries.execute({ collection: "posts", status: "published" });
    expect(published).toHaveLength(1);
  });

  it("ListEntriesUseCase clamps caller-supplied limit to MAX_LIMIT (500)", async () => {
    const h = harness();
    let listArgs: { limit?: number } | null = null;
    const original = h.store.list.bind(h.store);
    h.store.list = async (args) => {
      listArgs = args;
      return original(args);
    };
    await h.listEntries.execute({ collection: "posts", limit: 999_999 });
    expect(listArgs).not.toBeNull();
    expect(listArgs!.limit).toBe(500);
    await h.listEntries.execute({ collection: "posts", limit: -10 });
    expect(listArgs!.limit).toBe(50);
    await h.listEntries.execute({ collection: "posts" });
    expect(listArgs!.limit).toBe(50);
  });

  it("DeleteEntryUseCase removes the row", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    const result = await h.deleteEntry.execute({ id: created.id });
    expect(result.removed).toBe(true);
    expect(await h.store.get(created.id)).toBeNull();
  });

  it("DeleteEntryUseCase surfaces NOT_FOUND on missing ids", async () => {
    const h = harness();
    await expect(h.deleteEntry.execute({ id: "ghost" })).rejects.toMatchObject({
      diagnostic: { code: "NOT_FOUND" },
    });
  });
});

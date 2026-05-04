import { describe, expect, it } from "vitest";
import { DiagnosticError, type SchemaManifest } from "@aotter/mantle-spec";
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
    updateDraft: new UpdateDraftUseCase(store, clock),
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

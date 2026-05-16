import { describe, expect, it } from "vitest";
import { DiagnosticError, type SchemaManifest } from "@aotterclam/mantle-spec";
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
import type { SiteConfigRepository } from "../src/domain/port/SiteConfigRepository.js";
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

function harness(opts: {
  schemas?: ReadonlyMap<string, SchemaManifest>;
  siteConfig?: SiteConfigRepository;
} = {}): Harness {
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
    createDraft: new CreateDraftUseCase(store, schemas, clock, idgen, opts.siteConfig),
    updateDraft: new UpdateDraftUseCase(store, schemas, clock, opts.siteConfig),
    getEntry: new GetEntryUseCase(store),
    listEntries: new ListEntriesUseCase(store, schemas),
    requestPublish: new RequestPublishUseCase(store, schemas, clock, undefined, opts.siteConfig),
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

  it("rejects data that fails the Schema after projection", async () => {
    const schema = {
      ...postsSchema(),
      spec: {
        ...postsSchema().spec,
        schema: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            slug: { type: "string" as const, pattern: "^[a-z0-9-]+$" },
          },
          required: ["title", "slug"],
        },
      },
    };
    const h = harness({ schemas: new Map([[schema.metadata.name, schema]]) });
    await expect(
      h.createDraft.execute({
        collection: "posts",
        data: { title: "Hello", slug: "Not A Slug" },
        authorId: null,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "INPUT_VALIDATION_FAILED", path: "/slug" },
    });
  });

  it("rejects invalid email format in Schema-backed authoring paths", async () => {
    const schema: SchemaManifest = {
      apiVersion: "cms.clam.ai/v1",
      kind: "Schema",
      metadata: { name: "contact-messages" },
      spec: {
        title: "Contact messages",
        schema: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string", format: "email" },
            message: { type: "string" },
          },
          required: ["name", "email", "message"],
        },
        lifecycle: "simple",
      },
    };
    const h = harness({ schemas: new Map([[schema.metadata.name, schema]]) });
    await expect(
      h.createDraft.execute({
        collection: "contact-messages",
        data: { name: "A", email: "not-email", message: "Hi" },
        authorId: null,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "INPUT_VALIDATION_FAILED", path: "/email" },
    });
  });

  it("enforces Schema uniqueIndexes on create", async () => {
    const schema = {
      ...postsSchema(),
      spec: {
        ...postsSchema().spec,
        schema: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            slug: { type: "string" as const, pattern: "^[a-z0-9-]+$" },
          },
          required: ["title", "slug"],
        },
        uniqueIndexes: [["slug"]],
      },
    };
    const h = harness({ schemas: new Map([[schema.metadata.name, schema]]) });
    await h.createDraft.execute({
      collection: "posts",
      data: { title: "One", slug: "same" },
      authorId: null,
    });
    await expect(
      h.createDraft.execute({
        collection: "posts",
        data: { title: "Two", slug: "same" },
        authorId: null,
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "CONFLICT", path: "usecase/CreateDraft/posts/uniqueIndexes/0" },
    });
  });

  it("rejects localized entries whose locale is not enabled on the site", async () => {
    const schema: SchemaManifest = {
      apiVersion: "cms.clam.ai/v1",
      kind: "Schema",
      metadata: { name: "post-translations" },
      spec: {
        title: "Post translations",
        localized: true,
        schema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            locale: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
          },
          required: ["slug", "locale", "title", "body"],
        },
        lifecycle: "simple",
      },
    };
    const h = harness({
      schemas: new Map([[schema.metadata.name, schema]]),
      siteConfig: fakeSiteConfig(["en", "zh-TW"]),
    });
    await expect(
      h.createDraft.execute({
        collection: "post-translations",
        data: { slug: "hello", locale: "klingon-tlh", title: "Qapla", body: "..." },
        authorId: null,
      }),
    ).rejects.toMatchObject({
      diagnostic: {
        code: "INPUT_VALIDATION_FAILED",
        path: "usecase/CreateDraft/post-translations/locale",
      },
    });
  });

  it("accepts localized entries when site.locales is empty (subsystem off, ADR-0010)", async () => {
    const schema: SchemaManifest = {
      apiVersion: "cms.clam.ai/v1",
      kind: "Schema",
      metadata: { name: "post-translations" },
      spec: {
        title: "Post translations",
        localized: true,
        schema: {
          type: "object",
          properties: {
            slug: { type: "string" },
            locale: { type: "string" },
            title: { type: "string" },
            body: { type: "string" },
          },
          required: ["slug", "locale", "title", "body"],
        },
        lifecycle: "simple",
      },
    };
    const h = harness({
      schemas: new Map([[schema.metadata.name, schema]]),
      siteConfig: fakeSiteConfig([]),
    });
    const row = await h.createDraft.execute({
      collection: "post-translations",
      data: { slug: "hello", locale: "en", title: "Hi", body: "..." },
      authorId: null,
    });
    expect(row.collection).toBe("post-translations");
    expect((row.data as { locale: string }).locale).toBe("en");
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

  it("enforces Schema uniqueIndexes on update while excluding the current row", async () => {
    const schema = {
      ...postsSchema(),
      spec: {
        ...postsSchema().spec,
        schema: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            slug: { type: "string" as const },
          },
          required: ["title", "slug"],
        },
        uniqueIndexes: [["slug"]],
      },
    };
    const h = harness({ schemas: new Map([[schema.metadata.name, schema]]) });
    const first = await h.createDraft.execute({
      collection: "posts",
      data: { title: "One", slug: "one" },
      authorId: null,
    });
    const second = await h.createDraft.execute({
      collection: "posts",
      data: { title: "Two", slug: "two" },
      authorId: null,
    });
    await expect(
      h.updateDraft.execute({
        id: first.id,
        expectedVersion: 1,
        data: { title: "One updated", slug: "one" },
      }),
    ).resolves.toMatchObject({ data: { slug: "one" } });
    await expect(
      h.updateDraft.execute({
        id: second.id,
        expectedVersion: 1,
        data: { slug: "one" },
      }),
    ).rejects.toMatchObject({
      diagnostic: { code: "CONFLICT", path: `usecase/UpdateDraft/${second.id}/uniqueIndexes/0` },
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
      data: { title: "x" },
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
      data: { title: "x" },
      authorId: null,
    });
    await expect(h.requestPublish.execute({ id: created.id })).rejects.toMatchObject({
      diagnostic: { code: "LIFECYCLE_NOT_IN_V010" },
    });
  });

  it("rejects publishing a translated child without a published parent", async () => {
    const h = harness({ schemas: translatedSchemas() });
    const child = await h.createDraft.execute({
      collection: "post-translations",
      data: { slug: "ghost", locale: "en", title: "Ghost", body: "Missing parent" },
      authorId: null,
    });

    await expect(h.requestPublish.execute({ id: child.id })).rejects.toMatchObject({
      diagnostic: {
        code: "TRANSLATES_PARENT_UNKNOWN",
        value: {
          child: "post-translations",
          parent: "posts",
          field: "slug",
          value: "ghost",
        },
      },
    });
  });

  it("requires the translated parent to be published, not just drafted", async () => {
    const h = harness({ schemas: translatedSchemas() });
    await h.createDraft.execute({
      collection: "posts",
      data: { title: "Parent", slug: "draft-parent" },
      authorId: null,
    });
    const child = await h.createDraft.execute({
      collection: "post-translations",
      data: { slug: "draft-parent", locale: "en", title: "Draft parent", body: "Body" },
      authorId: null,
    });

    await expect(h.requestPublish.execute({ id: child.id })).rejects.toMatchObject({
      diagnostic: { code: "TRANSLATES_PARENT_UNKNOWN" },
    });
  });

  it("publishes a translated child once its parent is published", async () => {
    const h = harness({ schemas: translatedSchemas() });
    const parent = await h.createDraft.execute({
      collection: "posts",
      data: { title: "Parent", slug: "hello" },
      authorId: null,
    });
    await h.requestPublish.execute({ id: parent.id });
    const child = await h.createDraft.execute({
      collection: "post-translations",
      data: { slug: "hello", locale: "en", title: "Hello", body: "World" },
      authorId: null,
    });

    const published = await h.requestPublish.execute({ id: child.id });
    expect(published.status).toBe("published");
  });
});

function translatedSchemas(): ReadonlyMap<string, SchemaManifest> {
  const parent = postsSchema();
  const child: SchemaManifest = {
    apiVersion: "cms.clam.ai/v1",
    kind: "Schema",
    metadata: { name: "post-translations" },
    spec: {
      title: "Post translations",
      localized: true,
      translates: { parent: "posts", on: "slug" },
      schema: {
        type: "object",
        properties: {
          slug: { type: "string" },
          locale: { type: "string" },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["slug", "locale", "title", "body"],
      },
      lifecycle: "simple",
    },
  };
  return new Map([
    [parent.metadata.name, parent],
    [child.metadata.name, child],
  ]);
}

function fakeSiteConfig(locales: readonly string[]): SiteConfigRepository {
  return {
    seed: async () => undefined,
    load: async () => ({
      brand: "Test",
      title: "Test",
      description: "Test",
      origin: "https://example.com",
      locales,
    }),
    readLocales: async () => locales,
  };
}

describe("UnpublishUseCase", () => {
  it("flips published back to draft", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
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
      data: { title: "x" },
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
      data: { title: "x" },
      authorId: null,
    });
    const archived = await h.archive.execute({ id: created.id, expectedVersion: 1 });
    expect(archived.status).toBe("archived");
  });

  it("flips published → archived", async () => {
    const h = harness();
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
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
      data: { title: "x" },
      authorId: null,
    });
    await expect(
      h.getEntry.execute({ id: created.id, collection: "other" }),
    ).rejects.toMatchObject({ diagnostic: { code: "NOT_FOUND" } });
  });

  it("ListEntriesUseCase filters by status", async () => {
    const h = harness();
    const a = await h.createDraft.execute({ collection: "posts", data: { title: "a" }, authorId: null });
    await h.createDraft.execute({ collection: "posts", data: { title: "b" }, authorId: null });
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
      data: { title: "x" },
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

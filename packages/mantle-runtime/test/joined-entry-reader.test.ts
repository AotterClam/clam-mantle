import { describe, expect, it } from "vitest";
import type { SchemaManifest } from "@aotter/mantle-spec";
import { joinParentIfTranslation } from "../src/domain/service/JoinedEntryReader.js";
import { InMemoryDatabase } from "./fakes/database.js";
import { postsSchema } from "./fakes/manifests.js";

function translationsSchema(): SchemaManifest {
  return {
    apiVersion: "cms.mantle.aotter.net/v1",
    kind: "Schema",
    metadata: { name: "post-translations" },
    spec: {
      title: "Post translations",
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
      localized: true,
      translates: { parent: "posts", on: "slug" },
      lifecycle: "simple",
    },
  };
}

function seedEntry(
  db: InMemoryDatabase,
  args: {
    id: string;
    collection: string;
    data: Record<string, unknown>;
    status?: string;
    updated_at?: number;
  },
): void {
  db.entries.set(args.id, {
    id: args.id,
    collection: args.collection,
    status: args.status ?? "published",
    version: 1,
    data: JSON.stringify(args.data),
    author_id: null,
    created_at: 1,
    updated_at: args.updated_at ?? 2,
  });
}

describe("joinParentIfTranslation", () => {
  const schemas = new Map<string, SchemaManifest>([
    ["posts", postsSchema()],
    ["post-translations", translationsSchema()],
  ]);

  it("merges parent posts data into the translation", async () => {
    const db = new InMemoryDatabase();
    seedEntry(db, {
      id: "p1",
      collection: "posts",
      data: {
        slug: "hi",
        coverUrl: "https://example.com/cover.jpg",
        authorId: "u1",
        publishedAt: 1000,
      },
    });
    const translation = {
      id: "pt1",
      collection: "post-translations",
      locale: "en",
      status: "published" as const,
      version: 1,
      data: { slug: "hi", locale: "en", title: "Hi", body: "world" },
      createdAt: 1,
      updatedAt: 2,
    };

    const merged = await joinParentIfTranslation(db, schemas, translation, {
      parentStatus: "published",
    });

    expect(merged.data).toMatchObject({
      slug: "hi",
      locale: "en",
      title: "Hi",
      body: "world",
      coverUrl: "https://example.com/cover.jpg",
      authorId: "u1",
      publishedAt: 1000,
    });
    // Identity of non-data fields preserved
    expect(merged.id).toBe("pt1");
    expect(merged.collection).toBe("post-translations");
    expect(merged.locale).toBe("en");
  });

  it("translation values override parent on key conflicts", async () => {
    const db = new InMemoryDatabase();
    seedEntry(db, {
      id: "p1",
      collection: "posts",
      data: { slug: "hi", title: "PARENT-TITLE", coverUrl: "p.jpg" },
    });
    const translation = {
      id: "pt1",
      collection: "post-translations",
      locale: "en",
      status: "published" as const,
      version: 1,
      data: { slug: "hi", locale: "en", title: "TRANSLATION-TITLE", body: "x" },
      createdAt: 1,
      updatedAt: 2,
    };

    const merged = await joinParentIfTranslation(db, schemas, translation, {
      parentStatus: "published",
    });

    expect(merged.data["title"]).toBe("TRANSLATION-TITLE");
    expect(merged.data["coverUrl"]).toBe("p.jpg");
  });

  it("returns entry unchanged when its schema has no translates declaration", async () => {
    const db = new InMemoryDatabase();
    const standalone = {
      id: "p1",
      collection: "posts",
      status: "published" as const,
      version: 1,
      data: { slug: "hi", coverUrl: "p.jpg" },
      createdAt: 1,
      updatedAt: 2,
    };

    const result = await joinParentIfTranslation(db, schemas, standalone);

    expect(result).toBe(standalone);
  });

  it("returns translation unchanged when parent is missing", async () => {
    const db = new InMemoryDatabase();
    const translation = {
      id: "pt1",
      collection: "post-translations",
      locale: "en",
      status: "published" as const,
      version: 1,
      data: { slug: "orphan", locale: "en", title: "Hi", body: "x" },
      createdAt: 1,
      updatedAt: 2,
    };

    const result = await joinParentIfTranslation(db, schemas, translation, {
      parentStatus: "published",
    });

    expect(result).toBe(translation);
  });

  it("returns translation unchanged when join field is missing or empty", async () => {
    const db = new InMemoryDatabase();
    seedEntry(db, {
      id: "p1",
      collection: "posts",
      data: { slug: "hi", coverUrl: "p.jpg" },
    });
    const translation = {
      id: "pt1",
      collection: "post-translations",
      locale: "en",
      status: "published" as const,
      version: 1,
      data: { locale: "en", title: "Hi", body: "x" }, // no slug
      createdAt: 1,
      updatedAt: 2,
    };

    const result = await joinParentIfTranslation(db, schemas, translation);
    expect(result).toBe(translation);
  });
});

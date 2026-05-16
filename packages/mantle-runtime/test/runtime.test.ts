import { describe, expect, it } from "vitest";
import { createCmsRuntime } from "../src/runtime.js";
import { BootValidationError } from "../src/usecase/boot/index.js";
import { DatabaseSiteConfigRepository } from "../src/infrastructure/persistence/DatabaseSiteConfigRepository.js";
import { InMemoryDatabase } from "./fakes/database.js";
import { InMemoryKv } from "./fakes/kv.js";
import { makeProcedure } from "./fakes/manifests.js";
import type { AssetServer } from "../src/domain/port/index.js";

const noopAssets: AssetServer = {
  async fetch() {
    return null;
  },
};

describe("createCmsRuntime + bootInit", () => {
  it("constructs with empty manifests + required ports", async () => {
    const runtime = createCmsRuntime({
      manifests: [],
      db: new InMemoryDatabase(),
      kv: new InMemoryKv(),
      assets: noopAssets,
    });
    expect(runtime.schemasByName.size).toBe(0);
    expect(runtime.proceduresByName.size).toBe(0);
    expect(runtime.viewsByName.size).toBe(0);
  });

  it("bootInit runs migrations + seeds siteDefaults + validates", async () => {
    const db = new InMemoryDatabase();
    const runtime = createCmsRuntime({
      manifests: [makeProcedure()],
      handlers: { echoHandler: () => ({ ok: true }) },
      db,
      kv: new InMemoryKv(),
      assets: noopAssets,
      siteDefaults: {
        brand: "Blog",
        title: "Blog Site",
        description: "A nice place.",
        origin: "https://example.com",
      },
    });
    await runtime.bootInit();
    expect(db.appliedMigrations.has("0001-init")).toBe(true);
    const site = await new DatabaseSiteConfigRepository(db).load();
    expect(site.brand).toBe("Blog");
    expect(site.title).toBe("Blog Site");
    expect(site.description).toBe("A nice place.");
    expect(site.origin).toBe("https://example.com");
  });

  it("bootInit throws BootValidationError when handler ref is missing", async () => {
    const runtime = createCmsRuntime({
      manifests: [makeProcedure({ handlerRef: "missing" })],
      db: new InMemoryDatabase(),
      kv: new InMemoryKv(),
      assets: noopAssets,
    });
    await expect(runtime.bootInit()).rejects.toBeInstanceOf(BootValidationError);
  });

  it("seedSiteDefaults respects ON CONFLICT DO NOTHING semantics", async () => {
    const db = new InMemoryDatabase();
    const runtime = createCmsRuntime({
      manifests: [],
      db,
      kv: new InMemoryKv(),
      assets: noopAssets,
      siteDefaults: { brand: "First" },
    });
    await runtime.bootInit();
    // Operator edits the brand directly:
    db.siteConfig.set("brand", "Operator-Edited");
    // Subsequent boot with new defaults must NOT overwrite the operator's edit.
    const runtime2 = createCmsRuntime({
      manifests: [],
      db,
      kv: new InMemoryKv(),
      assets: noopAssets,
      siteDefaults: { brand: "Second" },
    });
    await runtime2.bootInit();
    const site = await new DatabaseSiteConfigRepository(db).load();
    expect(site.brand).toBe("Operator-Edited");
  });
});

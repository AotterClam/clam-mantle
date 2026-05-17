import { describe, expect, it } from "vitest";
import { buildDdl } from "../src/domain/service/SchemaDdlEmitter.js";
import type { SchemaManifest } from "../src/domain/model/ManifestGrammar.js";

const baseManifest = (name: string): SchemaManifest => ({
  apiVersion: "cms.mantle.aotter.net/v1",
  kind: "Schema",
  metadata: { name },
  spec: {
    schema: {
      type: "object",
      properties: { slug: { type: "string" } },
    },
    uniqueIndexes: [["slug"]],
  },
});

describe("buildDdl", () => {
  it("emits ALTER + CREATE INDEX for a well-formed schema", () => {
    const ddl = buildDdl(baseManifest("posts"));
    expect(ddl.addColumns).toHaveLength(1);
    expect(ddl.addColumns[0]).toMatch(/posts__slug/);
    expect(ddl.createIndexes[0]).toMatch(/uq_posts__slug/);
  });

  it("rejects an unsafe collection name (SQL injection guard)", () => {
    // Regression: collection was interpolated verbatim into the CASE
    // WHEN literal at SchemaDdlEmitter.ts:69 without going through
    // safeIdent. The buildDdl entry point now validates the manifest
    // name itself so the string-literal interpolation is safe.
    expect(() => buildDdl(baseManifest("foo'; DROP TABLE entries; --"))).toThrow(
      /unsafe collection identifier/,
    );
  });
});

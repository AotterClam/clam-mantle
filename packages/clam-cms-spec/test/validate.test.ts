import { describe, expect, it } from "vitest";
import { check } from "../src/usecase/ValidateManifestsUseCase.js";
import { parseManifests } from "../src/domain/service/ManifestParser.js";
import type {
  Manifest,
  ProcedureManifest,
  SchemaManifest,
  TriggerManifest,
  ViewManifest,
} from "../src/domain/model/ManifestGrammar.js";

/**
 * Tests for the Loop-1 validate check + the structural parse layer it
 * depends on. The check function is the library-level entry; consumer
 * test harnesses are expected to call it directly with parsed
 * manifests, so most cases here exercise that surface. INVALID_MANIFEST_ENVELOPE
 * is parser-emitted (it surfaces in the CLI when parseManifests
 * throws), so its test goes through parseManifests.
 */

const apiVersion = "cms.clam.ai/v1" as const;

function schema(
  name: string,
  overrides: Partial<SchemaManifest["spec"]> = {},
): SchemaManifest {
  return {
    apiVersion,
    kind: "Schema",
    metadata: { name },
    spec: {
      title: name,
      schema: {
        type: "object",
        properties: { slug: { type: "string" } },
      },
      ...overrides,
    },
  };
}

function view(
  name: string,
  from: string,
  overrides: Partial<ViewManifest["spec"]> = {},
): ViewManifest {
  return {
    apiVersion,
    kind: "View",
    metadata: { name },
    spec: { from, ...overrides },
  };
}

function procedure(name: string): ProcedureManifest {
  return {
    apiVersion,
    kind: "Procedure",
    metadata: { name },
    spec: {
      input: { type: "object" },
      output: { type: "object" },
      handler: { kind: "ref", ref: name },
    },
  };
}

function trigger(name: string, procedureName: string): TriggerManifest {
  return {
    apiVersion,
    kind: "Trigger",
    metadata: { name },
    spec: {
      source: { kind: "http", method: "POST", path: `/${name}` },
      target: { procedure: procedureName },
    },
  };
}

describe("check()", () => {
  it("returns no error diagnostics for a valid manifest set", () => {
    const manifests: Manifest[] = [
      schema("posts"),
      view("postList", "posts"),
      procedure("createPost"),
      trigger("createPostHttp", "createPost"),
    ];
    const result = check({ manifests });
    expect(result.errorCount).toBe(0);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("emits TRIGGER_TARGET_PROCEDURE_UNKNOWN when a Trigger targets an undeclared Procedure", () => {
    const manifests: Manifest[] = [
      schema("posts"),
      // Note: no Procedure "createPost" declared.
      trigger("createPostHttp", "createPost"),
    ];
    const result = check({ manifests });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("TRIGGER_TARGET_PROCEDURE_UNKNOWN");
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it("emits VIEW_FROM_UNKNOWN_SCHEMA when a View.from points at an undeclared Schema", () => {
    const manifests: Manifest[] = [
      // No Schema "posts".
      view("postList", "posts"),
    ];
    const result = check({ manifests });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("VIEW_FROM_UNKNOWN_SCHEMA");
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it("delegates the localized + translates check to checkLocaleAndTranslates", () => {
    // A localized child Schema referencing a non-existent parent should
    // surface TRANSLATES_PARENT_UNKNOWN — proves the delegation hooked up.
    const child: SchemaManifest = {
      apiVersion,
      kind: "Schema",
      metadata: { name: "postContent" },
      spec: {
        title: "Post content",
        schema: {
          type: "object",
          properties: { slug: { type: "string" } },
        },
        localized: true,
        translates: { parent: "ghost", on: "slug" },
      },
    };
    const result = check({ manifests: [child] });
    const codes = result.diagnostics.map((d) => d.code);
    expect(codes).toContain("TRANSLATES_PARENT_UNKNOWN");
  });
});

describe("parseManifests() (envelope-shape errors return diagnostics)", () => {
  it("returns INVALID_MANIFEST_ENVELOPE diagnostic when metadata.name is missing", () => {
    const yaml = `apiVersion: cms.clam.ai/v1
kind: Schema
metadata: {}
spec:
  title: Posts
  schema:
    type: object
`;
    const result = parseManifests(yaml);
    expect(result.manifests).toHaveLength(0);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "INVALID_MANIFEST_ENVELOPE",
    );
  });
});

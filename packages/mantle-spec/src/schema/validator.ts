import type { ZodType } from "zod";
import { jsonSchemaToZod, zodPathToJsonPointer } from "../json-schema-zod.js";
import {
  runtimeDiagnostic,
  type Diagnostic,
} from "../diagnostic.js";
import type { SchemaManifest } from "../manifests/grammar.js";

/**
 * Per-collection entry-data validator.
 *
 * Given a parsed `SchemaManifest` and an entry payload, runs zod
 * validation against the manifest's `spec.schema` and returns
 * Diagnostics. Compiled zod schemas are cached per
 * `metadata.name` so repeated `validate()` calls are cheap; the cache
 * is content-addressed-ish — calling `validate` with two different
 * SchemaManifests that share a `metadata.name` will reuse the first
 * compile, which is correct because manifest names are unique within
 * a deployment.
 *
 * Switched from Ajv to zod (POC issue #70) because Ajv's runtime
 * `compile()` calls `new Function()`, which CF Workers blocks under
 * V8's codegen-from-strings policy. zod composes builders into a
 * plain object tree and runs them through its interpreter at parse
 * time — no codegen, Workers-safe.
 *
 * The `x-mantle-ref`, `x-mcp-hint`, `x-mantle-bind` extension keywords
 * are tolerated (the converter ignores unknown keywords; they pass
 * through unmodified).
 *
 * Output shape is `Diagnostic[]` — empty array means "valid". The
 * dispatcher and admin-write paths surface the array directly; the
 * `phase: "runtime"` stamp is correct for entry-write validation,
 * which always happens at request-handling time. Static / boot phase
 * checks of the *schema document itself* live elsewhere.
 */
export class SchemaValidator {
  private readonly compiled: Map<string, ZodType> = new Map();

  /**
   * Validate `data` against `manifest.spec.schema`. Returns the empty
   * array on success; on failure, returns one or more Diagnostics
   * with `code: "INPUT_VALIDATION_FAILED"` and `path` set to the
   * RFC 6901 JSON Pointer of the offending field (`""` = root).
   */
  validate(manifest: SchemaManifest, data: unknown): readonly Diagnostic[] {
    const compiled = this.compileFor(manifest);
    const result = compiled.safeParse(data);
    if (result.success) return [];
    return result.error.issues.map((issue) =>
      runtimeDiagnostic({
        code: "INPUT_VALIDATION_FAILED",
        severity: "error",
        path: zodPathToJsonPointer(issue.path),
        message: issue.message,
      }),
    );
  }

  /**
   * Test-only escape hatch: peek at whether a given Schema has been
   * compiled yet. The cache is otherwise an internal implementation
   * detail. Not part of the package's public API surface.
   *
   * @internal
   */
  hasCompiled(name: string): boolean {
    return this.compiled.has(name);
  }

  private compileFor(manifest: SchemaManifest): ZodType {
    const name = manifest.metadata.name;
    let compiled = this.compiled.get(name);
    if (!compiled) {
      compiled = jsonSchemaToZod(manifest.spec.schema);
      this.compiled.set(name, compiled);
    }
    return compiled;
  }
}

import type { SchemaManifest } from "../manifests/grammar.js";

/**
 * Look up a Schema manifest by `metadata.name` from a parsed manifest
 * set. Returns `undefined` if no Schema with that name is present.
 *
 * The parallel manifest-parser pipeline (`clam-cms validate` /
 * `parseManifests`) emits a flat array of `Manifest` envelopes; this
 * helper narrows to the Schema kind.
 *
 * Caller's responsibility to handle the `undefined` case — a missing
 * Schema typically surfaces as a Diagnostic (`MANIFEST_ROOT_NOT_FOUND`
 * or kind-specific) at the call site that knew which name it was
 * looking for.
 */
export function findSchemaByName(
  manifests: ReadonlyArray<{ readonly kind: string; readonly metadata: { readonly name: string } }>,
  name: string,
): SchemaManifest | undefined {
  for (const m of manifests) {
    if (m.kind === "Schema" && m.metadata.name === name) {
      return m as unknown as SchemaManifest;
    }
  }
  return undefined;
}

/**
 * Return all Schema manifests from a parsed manifest set, in source
 * order. Convenience for boot-time loops that need to compile every
 * Schema (e.g. building per-collection validators or DDL).
 */
export function listSchemas(
  manifests: ReadonlyArray<{ readonly kind: string }>,
): readonly SchemaManifest[] {
  const out: SchemaManifest[] = [];
  for (const m of manifests) {
    if (m.kind === "Schema") out.push(m as unknown as SchemaManifest);
  }
  return out;
}

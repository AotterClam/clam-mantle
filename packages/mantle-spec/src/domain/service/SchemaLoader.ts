import type { Manifest, SchemaManifest } from "../model/ManifestGrammar.js";

/**
 * Look up a Schema manifest by `metadata.name` from a parsed manifest
 * set. Returns `undefined` if no Schema with that name is present.
 */
export function findSchemaByName(
  manifests: ReadonlyArray<Manifest>,
  name: string,
): SchemaManifest | undefined {
  for (const m of manifests) {
    if (m.kind === "Schema" && m.metadata.name === name) {
      return m;
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
  manifests: ReadonlyArray<Manifest>,
): readonly SchemaManifest[] {
  const out: SchemaManifest[] = [];
  for (const m of manifests) {
    if (m.kind === "Schema") out.push(m);
  }
  return out;
}

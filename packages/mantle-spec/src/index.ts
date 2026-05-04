/**
 * `@aotter/mantle-spec` — public surface.
 *
 * Pure spec engine: types + manifest YAML parse + validate +
 * diagnostics + JSON-Schema → zod converter. Zero env / adapter deps.
 * Imported by `mantle-runtime` (which adds dispatcher / entry-writer
 * / view executor on top) and by `mantle-spec`'s own CLI bin.
 *
 * The five categorical exports below mirror the `src/` directory tree
 * — `manifests/` for the 4-atom grammar, `schema/` for Schema-internal
 * helpers (DDL emit, entry-data validation), `entry/` for the entry
 * row + lifecycle state machine, plus the diagnostic shape and the
 * locale + JSON-Schema → zod converters.
 */
export * from "./diagnostic.js";
export * from "./locale.js";
export * from "./json-schema-zod.js";
export * from "./manifests/index.js";
export * from "./schema/index.js";
export * from "./entry/index.js";
export * from "./validate/index.js";

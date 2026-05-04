/**
 * `@aotterclam/clam-cms-spec` — public surface.
 *
 * Pure spec engine: types + manifest YAML parse + validate +
 * diagnostics + JSON-Schema → zod converter. Zero env / adapter deps.
 * Imported by `clam-cms-runtime` (which adds dispatcher / entry-writer
 * / view executor on top) and by `clam-cms-spec`'s own CLI bin.
 *
 * Public surface, by category:
 *  - root cross-cutters: `diagnostic` (Diagnostic shape + codes),
 *    `locale` (BCP 47 helpers), `json-schema-zod` (Workers-CSP-safe
 *    runtime validator)
 *  - `manifests/` — the 4-atom grammar (Schema/View/Procedure/Trigger)
 *    plus parse / cross-schema check / diagnose helpers / Loop-1 check
 *  - `schema/` — Schema-internal helpers (DDL emit, entry-data
 *    validator, by-name loader)
 *  - `entry/` — entry row + lifecycle state machine
 *  - `site/` — site-level declarative contract (SiteConfig +
 *    SiteDefaults seed validator); sibling to manifests, not a 5th atom
 */
export * from "./diagnostic.js";
export * from "./locale.js";
export * from "./json-schema-zod.js";
export * from "./manifests/index.js";
export * from "./schema/index.js";
export * from "./entry/index.js";
export * from "./site/index.js";

/**
 * `domain/model/` — runtime-only POs and VOs. Spec types
 * (`Entry`, `Revision`, `Approval`, `SiteConfig`, etc.) come
 * directly from `@aotterclam/clam-cms-spec`.
 *
 * Spec/runtime boundary: anything a spec function references lives in
 * `clam-cms-spec`. Anything only the dispatcher fills (`User`,
 * `Staff`, `HandlerContext`) lives here. See root CLAUDE.md.
 */
export * from "./EntryRow.js";
export * from "./User.js";
export * from "./Staff.js";
export * from "./HandlerContext.js";

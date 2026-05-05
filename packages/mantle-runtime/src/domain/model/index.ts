/**
 * `domain/model/` — runtime-only POs and VOs. Spec types
 * (`Entry`, `Revision`, `Approval`, `SiteConfig`, etc.) come
 * directly from `@aotter/mantle-spec`.
 *
 * Spec/runtime boundary: anything a spec function references lives in
 * `mantle-spec`. Anything only the dispatcher fills (`User`,
 * `Staff`, `HandlerContext`) lives here. See root CLAUDE.md.
 */
export * from "./EntryRow.js";
export * from "./User.js";
export * from "./Staff.js";
export * from "./HandlerContext.js";
export type { SeoMeta } from "./SeoMeta.js";
export {
  TemplateRegistry,
  type EntryContext,
  type ListContext,
  type EntryTemplate,
  type ListTemplate,
} from "./TemplateRegistry.js";

import type { Entry, SiteConfig } from "@aotterclam/mantle-spec";
import type {
  EntryTemplate,
  ListTemplate,
  TemplateRegistry,
} from "../model/TemplateRegistry.js";
import type { SeoMeta } from "../model/SeoMeta.js";

/**
 * Pure render functions over the consumer-supplied template registry.
 * Used by:
 *   - `HtmlPublishOrchestrator` (publish-time → write KV)
 *   - request-time route handlers in adapters (live-render bypass,
 *     preview surface)
 *
 * Both call sites previously inlined the template-lookup + doctype
 * concatenation. Extracting here keeps the contract single-sourced
 * — adding a doctype mode, an OG-meta wrapper, or a per-collection
 * pre/post hook is one edit. No I/O; no DB; no env access.
 */
const DEFAULT_DOCTYPE = "<!doctype html>";

export interface RenderEntryArgs {
  readonly entry: Entry;
  readonly site: SiteConfig;
  readonly templates: TemplateRegistry;
  /** Defaults to `<!doctype html>`. Pipelines that want the
   *  upper-case `<!DOCTYPE html>\n` shape pass it explicitly. */
  readonly doctype?: string;
  /** Optional pre-composed SEO/AEO block. Threaded into the
   *  `EntryContext.seo` field so templates can emit `<SeoTags
   *  seo={seo}/>` inside `<head>`. Renderers that skip composition
   *  leave it undefined — opt-out templates keep working. */
  readonly seo?: SeoMeta;
}

/** Returns the full HTML doc (doctype + body) or `null` if no entry
 *  template is registered for `entry.collection`. */
export function renderEntryHtml(args: RenderEntryArgs): string | null {
  const tpl: EntryTemplate | undefined = args.templates.getEntryTemplate(
    args.entry.collection,
  );
  if (!tpl) return null;
  return (
    (args.doctype ?? DEFAULT_DOCTYPE) +
    tpl({ entry: args.entry, site: args.site, seo: args.seo })
  );
}

export interface RenderListArgs {
  readonly collection: string;
  readonly locale: string;
  readonly entries: ReadonlyArray<Entry>;
  readonly site: SiteConfig;
  readonly templates: TemplateRegistry;
  readonly doctype?: string;
  readonly seo?: SeoMeta;
}

/** Returns the full HTML doc or `null` if no list template is
 *  registered for `collection`. */
export function renderListHtml(args: RenderListArgs): string | null {
  const tpl: ListTemplate | undefined = args.templates.getListTemplate(args.collection);
  if (!tpl) return null;
  return (
    (args.doctype ?? DEFAULT_DOCTYPE) +
    tpl({
      collection: args.collection,
      locale: args.locale,
      entries: args.entries,
      site: args.site,
      seo: args.seo,
    })
  );
}

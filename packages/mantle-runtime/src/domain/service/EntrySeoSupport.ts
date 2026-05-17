import type { Entry, SiteConfig } from "@aotterclam/mantle-spec";
import type { SeoMeta } from "../model/SeoMeta.js";
import type { PublicPathResolver } from "./PublicPathResolver.js";

/**
 * Structural shape of the SEO-meta composer the render pipeline
 * accepts. Lives in `domain/service/` (not `usecase/render/`) so
 * infrastructure code — notably `HtmlPublishOrchestrator` — can
 * import this helper without crossing the `infrastructure→usecase`
 * boundary that CLAUDE.md forbids.
 *
 * The runtime assembly root wires in `ComposeEntrySeoMetaUseCase`
 * which satisfies this shape; tests may pass a hand-rolled stub.
 */
export interface SeoComposer {
  execute(args: {
    readonly entry: Entry;
    readonly site: SiteConfig;
    readonly paths: PublicPathResolver;
  }): Promise<SeoMeta>;
}

/**
 * Shared "compose if the entry has a public URL" predicate. Keeps the
 * three callers (`RenderEntryLiveUseCase`, `PreviewEntryUseCase`,
 * `HtmlPublishOrchestrator`) from re-inlining the same null-check.
 */
export async function composeSeoIfPathed(
  composer: SeoComposer,
  paths: PublicPathResolver | null,
  entry: Entry,
  site: SiteConfig,
): Promise<SeoMeta | undefined> {
  if (!paths) return undefined;
  if (!paths.forEntry(entry)) return undefined;
  return composer.execute({ entry, site, paths });
}

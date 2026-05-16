import type { Entry, SiteConfig } from "@aotterclam/clam-mantle-spec";
import type { SeoMeta } from "../../domain/model/SeoMeta.js";
import type { PublicPathResolver } from "../../domain/service/PublicPathResolver.js";
import type { ComposeEntrySeoMetaUseCase } from "./ComposeEntrySeoMetaUseCase.js";

/**
 * Internal helper shared by render-pipeline use cases that opt into
 * SEO composition. Keeps the "if paths is set AND the resolver
 * yields a URL for this entry, compose; otherwise undefined" pattern
 * in one place — `RenderEntryLiveUseCase`, `PreviewEntryUseCase`, and
 * `HtmlPublishOrchestrator` all carry the same shape, and used to
 * each instantiate their own `ComposeEntrySeoMetaUseCase`.
 *
 * Now they receive the singleton via constructor injection (the
 * runtime assembly root builds one) and call this helper instead of
 * inlining the predicate three times.
 */
export type SeoComposer = ComposeEntrySeoMetaUseCase;

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

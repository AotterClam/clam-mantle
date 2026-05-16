import type { Entry, SiteConfig } from "@aotterclam/clam-mantle-spec";
import type { PublicPathResolver } from "../../../domain/service/PublicPathResolver.js";

/**
 * Request DTO for `ComposeEntrySeoMetaUseCase`. Caller passes the
 * entry, the site, and the resolver; the use case figures out
 * sibling translations for hreflang.
 */
export interface ComposeEntrySeoMetaRequest {
  readonly entry: Entry;
  readonly site: SiteConfig;
  readonly paths: PublicPathResolver;
  readonly type?: "article" | "website";
}

import type { SiteConfig } from "@aotterclam/mantle-spec";

export interface ComposeLlmsTxtRequest {
  readonly site: SiteConfig;
  /** locale: string → entries with that locale; locale: null →
   *  non-localized only (matches publish-pipeline semantic). */
  readonly locale: string | null;
}

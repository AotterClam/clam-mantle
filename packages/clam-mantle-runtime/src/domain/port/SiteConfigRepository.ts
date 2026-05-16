import type { SiteConfig, SiteDefaults } from "@aotterclam/clam-mantle-spec";

/**
 * `SiteConfigRepository` — the `site_config` row read/write surface
 * the runtime exposes to render paths and `bootInit`.
 *
 * `seed` is called once during `bootInit` with the config-supplied
 * `siteDefaults`; subsequent operator edits to the row are preserved
 * (INSERT … ON CONFLICT DO NOTHING).
 *
 * `load` returns the merged view template authors and adapters see.
 * `readLocales` exists separately because boot-time validation needs
 * the locales list before the rest of the row is meaningful.
 *
 * The DB-backed implementation is in
 * `infrastructure/persistence/DatabaseSiteConfigRepository`.
 */
export interface SiteConfigRepository {
  seed(defaults: SiteDefaults | undefined): Promise<void>;
  load(): Promise<SiteConfig>;
  readLocales(): Promise<readonly string[]>;
}

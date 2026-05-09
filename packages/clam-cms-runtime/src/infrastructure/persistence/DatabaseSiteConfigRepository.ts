import {
  assertSiteDefaultsCanonical,
  type SiteConfig,
  type SiteDefaults,
} from "@aotterclam/clam-cms-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import type { SiteConfigRepository } from "../../domain/port/SiteConfigRepository.js";

/**
 * `site_config` row read/write. Ships the seed declared by
 * `clam.config.ts > siteDefaults` on first deploy via INSERT … ON
 * CONFLICT DO NOTHING so operator edits are never overwritten on
 * subsequent deploys.
 *
 * The runtime calls `seed` once during bootInit; the result of `load`
 * is what every render path and template sees.
 *
 * Lives in `infrastructure/persistence/` because it talks to the DB
 * directly. Pure-domain validation (`assertSiteDefaultsCanonical`)
 * comes from spec.
 */
const KEYS = {
  brand: "brand",
  title: "title",
  description: "description",
  origin: "origin",
  locales: "locales",
  faviconUrl: "faviconUrl",
} as const;

export class DatabaseSiteConfigRepository implements SiteConfigRepository {
  constructor(private readonly db: DatabaseDriver) {}

  async seed(defaults: SiteDefaults | undefined): Promise<void> {
    if (!defaults) return;
    assertSiteDefaultsCanonical(defaults);
    const stmts = [];
    const insert = (key: string, value: string) =>
      this.db
        .prepare(`INSERT INTO site_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING`)
        .bind(key, value);
    if (defaults.brand && defaults.brand.length > 0) {
      stmts.push(insert(KEYS.brand, defaults.brand));
    }
    if (defaults.title && defaults.title.length > 0) {
      stmts.push(insert(KEYS.title, defaults.title));
    }
    if (defaults.description && defaults.description.length > 0) {
      stmts.push(insert(KEYS.description, defaults.description));
    }
    if (defaults.origin && defaults.origin.length > 0) {
      stmts.push(insert(KEYS.origin, defaults.origin));
    }
    if (defaults.faviconUrl && defaults.faviconUrl.length > 0) {
      stmts.push(insert(KEYS.faviconUrl, defaults.faviconUrl));
    }
    if (defaults.locales && defaults.locales.length > 0) {
      stmts.push(insert(KEYS.locales, defaults.locales.join(",")));
    }
    if (stmts.length > 0) {
      await this.db.batch(stmts);
    }
  }

  async load(): Promise<SiteConfig> {
    const rows = await this.db
      .prepare(`SELECT key, value FROM site_config`)
      .all<{ key: string; value: string }>();
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const localesRaw = m.get(KEYS.locales) ?? "";
    const locales = localesRaw
      ? localesRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
      : [];
    return {
      title: m.get(KEYS.title) ?? "CMS",
      description: m.get(KEYS.description) ?? "",
      origin: m.get(KEYS.origin) ?? "",
      locales,
      canonicalLocale: locales[0] ?? null,
      brand: m.get(KEYS.brand) ?? "Clam CMS",
      faviconUrl: m.get(KEYS.faviconUrl) || undefined,
    };
  }

  async readLocales(): Promise<readonly string[]> {
    const row = await this.db
      .prepare(`SELECT value FROM site_config WHERE key = ?`)
      .bind(KEYS.locales)
      .first<{ value: string }>();
    if (!row?.value) return [];
    return row.value.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  }
}

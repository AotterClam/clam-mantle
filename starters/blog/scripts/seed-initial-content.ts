/**
 * Production-oriented first-content seed.
 *
 * The install/provision Skills ask the site owner for public copy and
 * write `initial-seed.json`; this script applies that seed directly to
 * D1 and KV so the first deployed blog is immediately useful. MCP is
 * intentionally reserved for ongoing operations after owner bootstrap.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  CANONICAL_MIGRATIONS,
  composeEntrySeoMeta,
  entryHtmlKey,
  entryMarkdownKey,
  listHtmlKey,
  llmsTxtKey,
  serializeEntryAsMarkdown,
} from "@aotterclam/clam-cms-runtime";
import type { ContentState, Entry, SiteConfig } from "@aotterclam/clam-cms-spec";
import {
  pageTemplate,
  postListTemplate,
  postTemplate,
} from "../src/theme.default/templates/index.js";
import { PUBLIC_PATH_RESOLVER } from "../src/paths.js";

const DOCTYPE = "<!doctype html>";
const DEFAULT_NOW = Date.parse("2026-01-01T00:00:00.000Z");
const SEED_AUTHOR_ID = "seed-owner";

interface SeedText {
  readonly title: string;
  readonly intro?: string;
  readonly body: string;
}

interface InitialSeed {
  readonly brand: string;
  readonly tagline?: string;
  readonly description?: string;
  readonly origin: string;
  readonly locales: readonly string[];
  readonly canonicalLocale?: string;
  readonly mood?: string;
  readonly home: SeedText | LocalizedSeedText;
  readonly about: SeedText | LocalizedSeedText;
  readonly contact?: SeedText | LocalizedSeedText;
  readonly welcomePost: (SeedText & { readonly slug?: string; readonly coverUrl?: string }) | LocalizedWelcomePost;
}

type LocalizedSeedText = {
  readonly translations: Record<string, Partial<SeedText>>;
};

type LocalizedWelcomePost = {
  readonly slug?: string;
  readonly coverUrl?: string;
  readonly translations: Record<string, Partial<SeedText>>;
};

interface NormalizedSeed {
  readonly site: SiteConfig;
  readonly mood: string;
  readonly pages: readonly NormalizedPage[];
  readonly welcomePost: NormalizedPost;
}

interface NormalizedPage {
  readonly slug: "home" | "about" | "contact";
  readonly translations: ReadonlyMap<string, SeedText>;
}

interface NormalizedPost {
  readonly slug: string;
  readonly coverUrl: string;
  readonly translations: ReadonlyMap<string, SeedText>;
}

interface KvEntry {
  readonly key: string;
  readonly value: string;
}

interface Cli {
  readonly seedFile: string;
  readonly mode: "local" | "remote" | "dry-run";
  readonly origin?: string;
}

function parseCli(argv: readonly string[]): Cli {
  let seedFile = "initial-seed.json";
  let mode: Cli["mode"] = "local";
  let origin: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--seed-file") {
      seedFile = requireValue(argv[++i], "--seed-file");
      continue;
    }
    if (arg === "--origin") {
      origin = requireValue(argv[++i], "--origin");
      continue;
    }
    if (arg === "--remote") {
      mode = "remote";
      continue;
    }
    if (arg === "--local") {
      mode = "local";
      continue;
    }
    if (arg === "--dry-run") {
      mode = "dry-run";
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return origin ? { seedFile, mode, origin } : { seedFile, mode };
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function readSeed(path: string, overrides: { readonly origin?: string } = {}): NormalizedSeed {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<InitialSeed>;
  const brand = requiredString(raw.brand, "brand");
  const description = stringOr(raw.tagline, raw.description, `Notes, updates, and essays from ${brand}.`);
  const origin = overrides.origin ?? requiredString(raw.origin, "origin");
  const locales = normalizeLocales(raw.locales);
  const canonicalLocale = raw.canonicalLocale && locales.includes(raw.canonicalLocale)
    ? raw.canonicalLocale
    : locales[0] ?? null;
  const mood = (raw.mood ?? "warm").trim().toLowerCase();
  const site: SiteConfig = {
    brand,
    title: brand,
    description,
    origin: normalizeOrigin(origin),
    locales,
    canonicalLocale,
  };

  return {
    site,
    mood,
    pages: [
      { slug: "home", translations: normalizeTextByLocale(raw.home, locales, "home", defaultHome(brand, description)) },
      { slug: "about", translations: normalizeTextByLocale(raw.about, locales, "about", defaultAbout(brand)) },
      { slug: "contact", translations: normalizeTextByLocale(raw.contact, locales, "contact", defaultContact(brand)) },
    ],
    welcomePost: {
      slug: normalizeSlug(getObject(raw.welcomePost)?.slug, "welcome"),
      coverUrl: stringOr(getObject(raw.welcomePost)?.coverUrl, coverForMood(mood)),
      translations: normalizeTextByLocale(raw.welcomePost, locales, "welcomePost", defaultWelcomePost(brand)),
    },
  };
}

function getObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function normalizeLocales(input: unknown): readonly string[] {
  if (!Array.isArray(input)) throw new Error("locales must be an array");
  const locales = input.map((v) => {
    if (typeof v !== "string" || v.trim() === "") throw new Error("locales must contain strings");
    return v.trim();
  });
  if (locales.length === 0) throw new Error("locales must not be empty");
  return [...new Set(locales)];
}

function normalizeTextByLocale(
  input: unknown,
  locales: readonly string[],
  field: string,
  fallback: SeedText,
): ReadonlyMap<string, SeedText> {
  const obj = getObject(input);
  if (!obj) return new Map(locales.map((locale) => [locale, fallback]));

  const translations = getObject(obj.translations);
  const base = normalizeText(obj, fallback);
  return new Map(locales.map((locale) => {
    const localized = translations ? getObject(translations[locale]) : undefined;
    const text = normalizeText(localized, base);
    if (!text.title || !text.body) throw new Error(`${field}.${locale} requires title and body`);
    return [locale, text];
  }));
}

function normalizeText(input: Record<string, unknown> | undefined, fallback: SeedText): SeedText {
  return {
    title: stringOr(input?.title, fallback.title),
    intro: stringOr(input?.intro, fallback.intro),
    body: stringOr(input?.body, fallback.body),
  };
}

function requiredString(input: unknown, field: string): string {
  if (typeof input !== "string" || input.trim() === "") throw new Error(`${field} is required`);
  return input.trim();
}

function stringOr(...values: readonly unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function normalizeSlug(input: unknown, fallback: string): string {
  const raw = typeof input === "string" && input.trim() ? input.trim().toLowerCase() : fallback;
  const slug = raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  return slug || fallback;
}

function defaultHome(brand: string, description: string): SeedText {
  return {
    title: brand,
    intro: description,
    body: `Welcome to ${brand}. This page was seeded during setup so you can start editing from a real site instead of a blank shell.`,
  };
}

function defaultAbout(brand: string): SeedText {
  return {
    title: "About",
    intro: `About ${brand}.`,
    body: `${brand} is a new site managed by Clam CMS and AI agents. Replace this page with your story, services, and contact context.`,
  };
}

function defaultContact(brand: string): SeedText {
  return {
    title: "Contact",
    intro: `Reach ${brand}.`,
    body: "Use the contact form to send a message. The site owner can connect follow-up automations after MCP is connected.",
  };
}

function defaultWelcomePost(brand: string): SeedText {
  return {
    title: `Welcome to ${brand}`,
    intro: "The first update is live.",
    body: `This is the first post on ${brand}. Tell readers what you are building, what they can expect next, and how they should respond.`,
  };
}

function coverForMood(mood: string): string {
  const covers: Record<string, string> = {
    editorial: "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=1200",
    minimal: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200",
    playful: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200",
    technical: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200",
    warm: "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200",
  };
  return covers[mood] ?? covers.warm!;
}

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

function buildSql(seed: NormalizedSeed, now: number): string {
  const lines: string[] = [];
  lines.push("-- clam-cms initial content seed (idempotent).");
  for (const m of CANONICAL_MIGRATIONS) {
    lines.push(`-- migration ${m.id}: ${m.description}`);
    lines.push(m.sql.trim());
  }
  // No explicit BEGIN/COMMIT — wrangler d1 execute wraps each batch as
  // an implicit transaction, and D1's HTTP API rejects manual BEGIN.
  for (const [key, value] of Object.entries({
    brand: seed.site.brand,
    title: seed.site.title,
    description: seed.site.description ?? "",
    origin: seed.site.origin,
    locales: seed.site.locales.join(","),
    canonicalLocale: seed.site.canonicalLocale ?? seed.site.locales[0],
  })) {
    lines.push(
      `INSERT OR REPLACE INTO site_config (key, value) VALUES ('${escapeSql(key)}', '${escapeSql(String(value))}');`,
    );
  }
  lines.push(
    `INSERT OR REPLACE INTO users (id, email, name, created_at, updated_at) VALUES ('${SEED_AUTHOR_ID}', NULL, 'Initial Seed', ${now}, ${now});`,
  );

  for (const page of seed.pages) {
    const pageData = JSON.stringify({ slug: page.slug, authorId: SEED_AUTHOR_ID, publishedAt: now });
    lines.push(insertEntrySql({
      id: `seed-page-${page.slug}`,
      collection: "pages",
      data: pageData,
      now,
    }));
    for (const [locale, text] of page.translations) {
      const trData = JSON.stringify({
        slug: page.slug,
        locale,
        title: text.title,
        intro: text.intro,
        body: text.body,
      });
      lines.push(insertEntrySql({
        id: `seed-pgt-${page.slug}-${locale.toLowerCase()}`,
        collection: "page-translations",
        data: trData,
        now,
      }));
    }
  }

  const postData = JSON.stringify({
    slug: seed.welcomePost.slug,
    coverUrl: seed.welcomePost.coverUrl,
    authorId: SEED_AUTHOR_ID,
    publishedAt: now,
  });
  lines.push(insertEntrySql({
    id: `seed-post-${seed.welcomePost.slug}`,
    collection: "posts",
    data: postData,
    now,
  }));
  for (const [locale, text] of seed.welcomePost.translations) {
    const trData = JSON.stringify({
      slug: seed.welcomePost.slug,
      locale,
      title: text.title,
      body: text.body,
      coverUrl: seed.welcomePost.coverUrl,
      publishedAt: now,
      authorId: SEED_AUTHOR_ID,
    });
    lines.push(insertEntrySql({
      id: `seed-pt-${seed.welcomePost.slug}-${locale.toLowerCase()}`,
      collection: "post-translations",
      data: trData,
      now,
    }));
  }

  return lines.join("\n") + "\n";
}

function insertEntrySql(args: {
  readonly id: string;
  readonly collection: string;
  readonly data: string;
  readonly now: number;
}): string {
  return `INSERT OR REPLACE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${escapeSql(args.id)}', '${escapeSql(args.collection)}', 'published', 1, '${escapeSql(args.data)}', '${SEED_AUTHOR_ID}', ${args.now}, ${args.now});`;
}

function buildEntry(args: {
  readonly id: string;
  readonly collection: string;
  readonly locale?: string;
  readonly data: Record<string, unknown>;
  readonly now: number;
}): Entry {
  return {
    id: args.id,
    collection: args.collection,
    locale: args.locale,
    status: "published" as ContentState,
    version: 1,
    data: args.data,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function buildKvEntries(seed: NormalizedSeed, now: number): readonly KvEntry[] {
  const out: KvEntry[] = [];
  const postsByLocale = new Map<string, Entry[]>();
  const postEntries = [...seed.welcomePost.translations].map(([locale, text]) => buildPostEntry(seed, locale, text, now));

  for (const entry of postEntries) {
    const locale = entry.locale ?? "";
    out.push({
      key: entryHtmlKey(entry),
      value: DOCTYPE + postTemplate({
        entry,
        site: seed.site,
        seo: seoForEntry(seed.site, entry, postEntries),
      }),
    });
    const md = serializeEntryAsMarkdown(entry);
    if (md) out.push({ key: entryMarkdownKey(entry), value: md });
    postsByLocale.set(locale, [entry]);
  }

  for (const [locale, entries] of postsByLocale) {
    out.push({
      key: listHtmlKey("post-translations", locale),
      value: DOCTYPE + postListTemplate({
        collection: "post-translations",
        locale,
        entries,
        site: seed.site,
      }),
    });
    out.push({
      key: llmsTxtKey(locale),
      value: renderLlmsTxt(seed.site, locale, entries),
    });
  }
  out.push({
    key: llmsTxtKey(""),
    value: renderLlmsTxt(seed.site, "", [...postsByLocale.values()].flat()),
  });

  for (const page of seed.pages) {
    const pageEntries = [...page.translations].map(([locale, text]) => buildPageEntry(page, locale, text, now));
    for (const entry of pageEntries) {
      out.push({
        key: entryHtmlKey(entry),
        value: DOCTYPE + pageTemplate({
          entry,
          site: seed.site,
          seo: seoForEntry(seed.site, entry, pageEntries),
        }),
      });
      const md = serializeEntryAsMarkdown(entry);
      if (md) out.push({ key: entryMarkdownKey(entry), value: md });
    }
  }

  return out;
}

function buildPostEntry(seed: NormalizedSeed, locale: string, text: SeedText, now: number): Entry {
  return buildEntry({
    id: `seed-pt-${seed.welcomePost.slug}-${locale.toLowerCase()}`,
    collection: "post-translations",
    locale,
    now,
    data: {
      slug: seed.welcomePost.slug,
      locale,
      title: text.title,
      body: text.body,
      coverUrl: seed.welcomePost.coverUrl,
      publishedAt: now,
      authorId: SEED_AUTHOR_ID,
    },
  });
}

function buildPageEntry(page: NormalizedPage, locale: string, text: SeedText, now: number): Entry {
  return buildEntry({
    id: `seed-pgt-${page.slug}-${locale.toLowerCase()}`,
    collection: "page-translations",
    locale,
    now,
    data: {
      slug: page.slug,
      locale,
      title: text.title,
      intro: text.intro,
      body: text.body,
    },
  });
}

function seoForEntry(site: SiteConfig, entry: Entry, siblings: readonly Entry[]) {
  const publicPath = PUBLIC_PATH_RESOLVER.forEntry(entry);
  if (!publicPath) return undefined;
  return composeEntrySeoMeta({
    entry,
    site,
    publicPath,
    siblings: siblings
      .filter((s) => s.id !== entry.id)
      .map((s) => {
        const siblingPath = PUBLIC_PATH_RESOLVER.forEntry(s);
        return siblingPath && s.locale ? { locale: s.locale, publicPath: siblingPath } : null;
      })
      .filter((s): s is { locale: string; publicPath: string } => s !== null),
  });
}

function renderLlmsTxt(site: SiteConfig, locale: string, entries: readonly Entry[]): string {
  let out = `# ${site.title}\n\n`;
  if (site.description) out += `> ${site.description}\n\n`;
  if (locale) out += `Locale: ${locale}\n\n`;
  out += "## post-translations\n\n";
  for (const e of entries) {
    const data = e.data as { slug?: string; title?: string; body?: string };
    const title = data.title ?? data.slug ?? e.id;
    const slug = data.slug ?? e.id;
    const entryLocale = locale || e.locale || "";
    const urlLocale = entryLocale ? `/${entryLocale.toLowerCase()}` : "";
    const url = `${site.origin}${urlLocale}/posts/${slug}`;
    const excerpt = (data.body ?? "").split("\n")[0]?.slice(0, 140) ?? "";
    out += excerpt ? `- [${title}](${url}): ${excerpt}\n` : `- [${title}](${url})\n`;
  }
  return out + "\n";
}

function applySeed(mode: Cli["mode"]): void {
  if (mode === "dry-run") return;
  const localFlag = mode === "local" ? "--local" : "--remote";
  execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "DB", localFlag, "--file=.clam-seed.sql"], {
    stdio: "inherit",
  });
  const kvArgs = ["exec", "wrangler", "kv", "bulk", "put", "--binding=KV", ".clam-seed.kv.json"];
  if (mode === "local") kvArgs.splice(5, 0, "--local");
  execFileSync("pnpm", kvArgs, { stdio: "inherit" });
}

function main(): void {
  const cli = parseCli(process.argv.slice(2));
  const seed = readSeed(cli.seedFile, cli.origin ? { origin: cli.origin } : {});
  const now = Date.now() || DEFAULT_NOW;
  const sql = buildSql(seed, now);
  const kv = buildKvEntries(seed, now);
  writeFileSync(".clam-seed.sql", sql);
  writeFileSync(".clam-seed.kv.json", JSON.stringify(kv, null, 2));
  process.stdout.write(`Wrote .clam-seed.sql (${sql.split("\n").length} lines)\n`);
  process.stdout.write(`Wrote .clam-seed.kv.json (${kv.length} entries)\n`);
  applySeed(cli.mode);
  if (cli.mode === "dry-run") {
    process.stdout.write("Dry run complete. No D1/KV writes were applied.\n");
  } else {
    process.stdout.write(`Initial content seed applied to ${cli.mode} D1/KV.\n`);
  }
}

main();

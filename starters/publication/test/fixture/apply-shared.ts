/**
 * Shared fixture builder + applier. Two callers pick the mode:
 *
 *   apply-dev.ts   → `pnpm fixture` — seeds the dev profile with demo
 *                    posts/pages so a fresh `pnpm dev` admin SPA has
 *                    something to render. Does NOT seed the `staff`
 *                    table; the OAuth callback's `ensureBootstrapOwner`
 *                    fires for the first admin login.
 *
 *   apply-test.ts  → `pnpm test:integration` (via globalSetup) — seeds
 *                    the test profile with the same demo content PLUS
 *                    a `staff(u-staff-1, editor)` row that mcp-smoke /
 *                    view-smoke depend on for role-gated write paths.
 *                    Targets the test profile's wrangler env
 *                    (`--env test --persist-to .wrangler-test`).
 *
 * The split exists because dev and test cannot share the same staff
 * seed: a pre-seeded staff row makes `ensureBootstrapOwner`'s
 * `WHERE NOT EXISTS (SELECT 1 FROM staff)` guard a no-op, locking the
 * dev's first OAuth login out of the admin. See issue #43 for the
 * structural rationale.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  CANONICAL_MIGRATIONS,
  entryHtmlKey,
  entryMarkdownKey,
  listHtmlKey,
  llmsTxtKey,
  serializeEntryAsMarkdown,
} from "@aotterclam/clam-cms-runtime";
import type { Entry, ContentState } from "@aotterclam/clam-cms-spec";
import {
  pageTemplate,
  postTemplate,
  postListTemplate,
} from "../../src/theme.default/templates/index.js";
import {
  FIXTURE_AUTHOR_ID,
  FIXTURE_NOW,
  FIXTURE_PAGES,
  FIXTURE_POSTS,
  FIXTURE_SITE,
} from "./data.js";

// Match HtmlPublishOrchestrator: registered templates return body
// without a doctype prefix; whoever ships HTML to KV adds one.
const DOCTYPE = "<!doctype html>";

export interface ApplyFixtureOptions {
  /**
   * When true, seeds `staff(u-staff-1, editor)`. Required for the
   * test profile (mcp-smoke / view-smoke authenticate as
   * `Bearer dev-u-staff-1`); MUST be false for the dev profile so
   * `ensureBootstrapOwner` can fire on the operator's first OAuth
   * login.
   */
  readonly seedStaffEditor: boolean;
  /**
   * Wrangler env name (`--env <name>`) for `wrangler d1` /
   * `wrangler kv` commands. Pass undefined for the default env.
   */
  readonly wranglerEnv?: string;
  /**
   * Wrangler `--persist-to <dir>` argument. Without it, miniflare
   * uses `.wrangler/`; pass `.wrangler-test` for test isolation.
   */
  readonly persistTo?: string;
  /**
   * Filename prefix for the generated artefacts. Lets dev and test
   * runs produce side-by-side files for debugging.
   */
  readonly artefactPrefix: string;
}

interface KvEntry {
  readonly key: string;
  readonly value: string;
}

function escape(s: string): string {
  return s.replace(/'/g, "''");
}

function buildSql(opts: ApplyFixtureOptions): string {
  const lines: string[] = [];
  lines.push(`-- starter-publication fixture (${opts.artefactPrefix}, idempotent).`);
  lines.push("-- 1. Run canonical migrations (wrangler dev runs them in-memory");
  lines.push("--    only — `wrangler d1 execute --local` opens an isolated DB");
  lines.push("--    so the fixture must apply migrations itself before inserts).");
  for (const m of CANONICAL_MIGRATIONS) {
    lines.push(`-- migration ${m.id}: ${m.description}`);
    lines.push(m.sql.trim());
  }
  lines.push("-- 2. Fixture data (idempotent via OR IGNORE).");
  lines.push("BEGIN TRANSACTION;");

  for (const [key, value] of Object.entries({
    brand: FIXTURE_SITE.brand,
    title: FIXTURE_SITE.title,
    description: FIXTURE_SITE.description,
    origin: FIXTURE_SITE.origin,
    locales: FIXTURE_SITE.locales.join(","),
  })) {
    lines.push(
      `INSERT OR IGNORE INTO site_config (key, value) VALUES ('${escape(key)}', '${escape(value)}');`,
    );
  }

  lines.push(
    `INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES ('${FIXTURE_AUTHOR_ID}', 'editor@example.com', 'Demo Editor', ${FIXTURE_NOW});`,
  );
  if (opts.seedStaffEditor) {
    lines.push(
      `INSERT OR IGNORE INTO staff (user_id, role, granted_by, granted_at) VALUES ('${FIXTURE_AUTHOR_ID}', 'editor', NULL, ${FIXTURE_NOW});`,
    );
  }

  let postIndex = 1;
  for (const post of FIXTURE_POSTS) {
    const postId = `fx-post-${postIndex++}`;
    const data = JSON.stringify({
      slug: post.slug,
      coverUrl: post.coverUrl,
      authorId: FIXTURE_AUTHOR_ID,
      publishedAt: FIXTURE_NOW,
    });
    lines.push(
      `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${postId}', 'posts', 'published', 1, '${escape(data)}', '${FIXTURE_AUTHOR_ID}', ${FIXTURE_NOW}, ${FIXTURE_NOW});`,
    );
    for (const tr of post.translations) {
      const trId = `fx-pt-${post.slug}-${tr.locale.toLowerCase()}`;
      const trData = JSON.stringify({
        slug: post.slug,
        locale: tr.locale,
        title: tr.title,
        body: tr.body,
      });
      lines.push(
        `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${trId}', 'post-translations', 'published', 1, '${escape(trData)}', '${FIXTURE_AUTHOR_ID}', ${FIXTURE_NOW}, ${FIXTURE_NOW});`,
      );
    }
  }

  let pageIndex = 1;
  for (const page of FIXTURE_PAGES) {
    const pageId = `fx-page-${pageIndex++}`;
    const data = JSON.stringify({
      slug: page.slug,
      authorId: FIXTURE_AUTHOR_ID,
      publishedAt: FIXTURE_NOW,
    });
    lines.push(
      `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${pageId}', 'pages', 'published', 1, '${escape(data)}', '${FIXTURE_AUTHOR_ID}', ${FIXTURE_NOW}, ${FIXTURE_NOW});`,
    );
    for (const tr of page.translations) {
      const trId = `fx-pgt-${page.slug}-${tr.locale.toLowerCase()}`;
      const trData = JSON.stringify({
        slug: page.slug,
        locale: tr.locale,
        title: tr.title,
        intro: tr.intro,
        body: tr.body,
      });
      lines.push(
        `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${trId}', 'page-translations', 'published', 1, '${escape(trData)}', '${FIXTURE_AUTHOR_ID}', ${FIXTURE_NOW}, ${FIXTURE_NOW});`,
      );
    }
  }
  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

function buildEntry(args: {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  locale?: string;
}): Entry {
  return {
    id: args.id,
    collection: args.collection,
    locale: args.locale,
    status: "published" as ContentState,
    version: 1,
    data: args.data,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  };
}

function buildKvEntries(): readonly KvEntry[] {
  const out: KvEntry[] = [];
  const byLocale = new Map<string, Entry[]>();
  for (const post of FIXTURE_POSTS) {
    for (const tr of post.translations) {
      const entry = buildEntry({
        id: `fx-pt-${post.slug}-${tr.locale.toLowerCase()}`,
        collection: "post-translations",
        locale: tr.locale,
        data: {
          slug: post.slug,
          locale: tr.locale,
          title: tr.title,
          body: tr.body,
          coverUrl: post.coverUrl,
          publishedAt: FIXTURE_NOW,
          authorId: FIXTURE_AUTHOR_ID,
        },
      });
      out.push({
        key: entryHtmlKey(entry),
        value: DOCTYPE + postTemplate({ entry, site: FIXTURE_SITE }),
      });
      const md = serializeEntryAsMarkdown(entry);
      if (md) out.push({ key: entryMarkdownKey(entry), value: md });
      const list = byLocale.get(tr.locale) ?? [];
      list.push(entry);
      byLocale.set(tr.locale, list);
    }
  }
  for (const [locale, entries] of byLocale) {
    out.push({
      key: listHtmlKey("post-translations", locale),
      value:
        DOCTYPE +
        postListTemplate({
          collection: "post-translations",
          locale,
          entries,
          site: FIXTURE_SITE,
        }),
    });
    out.push({
      key: llmsTxtKey(locale),
      value: renderLlmsTxt(locale, entries),
    });
  }
  out.push({
    key: llmsTxtKey(""),
    value: renderLlmsTxt("", [...byLocale.values()].flat()),
  });

  for (const page of FIXTURE_PAGES) {
    for (const tr of page.translations) {
      const entry = buildEntry({
        id: `fx-pgt-${page.slug}-${tr.locale.toLowerCase()}`,
        collection: "page-translations",
        locale: tr.locale,
        data: {
          slug: page.slug,
          locale: tr.locale,
          title: tr.title,
          intro: tr.intro,
          body: tr.body,
        },
      });
      out.push({
        key: entryHtmlKey(entry),
        value: DOCTYPE + pageTemplate({ entry, site: FIXTURE_SITE }),
      });
      const md = serializeEntryAsMarkdown(entry);
      if (md) out.push({ key: entryMarkdownKey(entry), value: md });
    }
  }
  return out;
}

function renderLlmsTxt(locale: string, entries: readonly Entry[]): string {
  const urlLocale = locale ? `/${locale.toLowerCase()}` : "";
  let out = `# ${FIXTURE_SITE.title}\n\n`;
  if (FIXTURE_SITE.description) out += `> ${FIXTURE_SITE.description}\n\n`;
  if (locale) out += `Locale: ${locale}\n\n`;
  out += `## post-translations\n\n`;
  for (const e of entries) {
    const data = e.data as { slug?: string; title?: string; body?: string };
    const title = data.title ?? data.slug ?? e.id;
    const slug = data.slug ?? e.id;
    const url = `${FIXTURE_SITE.origin}${urlLocale}/posts/${slug}`;
    const excerpt = (data.body ?? "").split("\n")[0]?.slice(0, 140) ?? "";
    out += excerpt ? `- [${title}](${url}): ${excerpt}\n` : `- [${title}](${url})\n`;
  }
  return out + "\n";
}

function wranglerArgs(opts: ApplyFixtureOptions): string {
  const parts: string[] = [];
  if (opts.wranglerEnv) parts.push(`--env=${opts.wranglerEnv}`);
  if (opts.persistTo) parts.push(`--persist-to=${opts.persistTo}`);
  return parts.join(" ");
}

export async function applyFixture(opts: ApplyFixtureOptions): Promise<void> {
  const sql = buildSql(opts);
  const kv = buildKvEntries();
  const sqlPath = `.fixture.${opts.artefactPrefix}.sql`;
  const kvPath = `.fixture.${opts.artefactPrefix}.kv.json`;
  writeFileSync(sqlPath, sql);
  writeFileSync(kvPath, JSON.stringify(kv, null, 2));
  process.stdout.write(`Wrote ${sqlPath} (${sql.split("\n").length} lines)\n`);
  process.stdout.write(`Wrote ${kvPath} (${kv.length} entries)\n`);

  const flags = wranglerArgs(opts);
  process.stdout.write(
    `\nApplying D1 fixtures (migrations + inserts)${flags ? ` [${flags}]` : ""}...\n`,
  );
  execSync(
    `wrangler d1 execute DB --local --file=${sqlPath} ${flags}`.trim(),
    { stdio: "inherit" },
  );

  process.stdout.write("\nApplying KV fixtures...\n");
  execSync(
    `wrangler kv bulk put --local --binding=KV ${kvPath} ${flags}`.trim(),
    { stdio: "inherit" },
  );

  process.stdout.write("\nFixture applied.\n");
}

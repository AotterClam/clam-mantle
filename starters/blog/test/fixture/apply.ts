/**
 * Fixture applier. Renders pre-published HTML for the seeded posts +
 * per-locale lists, then applies both D1 inserts and KV puts so the
 * starter's public read path (`GET /{locale}/posts/{slug}` + `GET
 * /{locale}/posts`) returns rendered pages immediately after fixture
 * apply — no admin UI publish flow needed.
 *
 * Usage (from starters/blog/):
 *   pnpm fixture
 *
 * That runs this script which:
 *   1. Generates D1 SQL → `.fixture.sql`
 *   2. Renders templates against fixture entries → `.fixture.kv.json`
 *      (wrangler kv-bulk format)
 *   3. Executes both via `wrangler d1 execute` + `wrangler kv bulk put`
 *      against the local D1 + KV bindings declared in wrangler.toml.
 *
 * Idempotent: SQL inserts are `OR IGNORE`; KV puts overwrite.
 *
 * NOT a production seed. The starter's README points consumers at
 * the admin UI for real content; this script is for local dev + the
 * starter's integration tests.
 */
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { entryHtmlKey, listHtmlKey } from "@aotter/mantle-runtime";
import type { Entry, ContentState } from "@aotter/mantle-spec";
import { postTemplate, postListTemplate } from "../../src/templates/index.js";
import {
  FIXTURE_AUTHOR_ID,
  FIXTURE_NOW,
  FIXTURE_POSTS,
  FIXTURE_SITE,
} from "./data.js";

interface KvEntry {
  readonly key: string;
  readonly value: string;
}

function escape(s: string): string {
  return s.replace(/'/g, "''");
}

function buildSql(): string {
  const lines: string[] = [];
  lines.push("-- starter-blog test fixture (idempotent). Re-runnable via OR IGNORE.");
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
  lines.push(
    `INSERT OR IGNORE INTO staff (user_id, role, granted_by, granted_at) VALUES ('${FIXTURE_AUTHOR_ID}', 'editor', NULL, ${FIXTURE_NOW});`,
  );

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
  // Render each translation as `entry:html:<locale>/post-translations/<slug>`.
  // Render per-locale lists as `list:html:<locale>/post-translations`.
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
          // Surface the parent fields so the template can use them
          // even though the storage row only carries language-specific
          // data — same shape an admin-UI publish flow eventually
          // produces by joining post-translations to its parent.
          coverUrl: post.coverUrl,
          publishedAt: FIXTURE_NOW,
          authorId: FIXTURE_AUTHOR_ID,
        },
      });
      out.push({
        key: entryHtmlKey(entry),
        value: postTemplate({ entry, site: FIXTURE_SITE }),
      });
      const list = byLocale.get(tr.locale) ?? [];
      list.push(entry);
      byLocale.set(tr.locale, list);
    }
  }
  for (const [locale, entries] of byLocale) {
    out.push({
      key: listHtmlKey("post-translations", locale),
      value: postListTemplate({
        collection: "post-translations",
        locale,
        entries,
        site: FIXTURE_SITE,
      }),
    });
  }
  return out;
}

function main(): void {
  const sql = buildSql();
  const kv = buildKvEntries();
  writeFileSync(".fixture.sql", sql);
  writeFileSync(".fixture.kv.json", JSON.stringify(kv, null, 2));
  process.stdout.write(`Wrote .fixture.sql (${sql.split("\n").length} lines)\n`);
  process.stdout.write(`Wrote .fixture.kv.json (${kv.length} entries)\n`);

  process.stdout.write("\nApplying D1 fixtures...\n");
  execSync("wrangler d1 execute mantle-blog-local --local --file=.fixture.sql", {
    stdio: "inherit",
  });

  process.stdout.write("\nApplying KV fixtures...\n");
  execSync(
    "wrangler kv bulk put --local --binding=KV .fixture.kv.json",
    { stdio: "inherit" },
  );

  process.stdout.write("\nFixture applied. Try:\n");
  process.stdout.write("  curl http://localhost:8787/en/posts/hello-world\n");
  process.stdout.write("  curl http://localhost:8787/zh-TW/posts\n");
}

main();

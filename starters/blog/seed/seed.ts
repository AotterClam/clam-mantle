/**
 * Idempotent local-dev seed. Emits SQL to stdout; pipe it to
 * `wrangler d1 execute mantle-blog-local --local --file=/dev/stdin` (or
 * the rebuild's preferred runner) to populate a fresh local D1 with:
 *
 *   - 3 posts (parent rows, language-neutral)
 *   - 6 post-translations (3 posts × 2 locales = en + zh-TW)
 *   - site_config rows (brand / locales / canonical)
 *
 * Re-runnable: every INSERT uses `OR IGNORE` so re-seeding is a no-op
 * for existing rows. Migrations run via `runtime.bootInit()` on first
 * request — we DON'T re-run them here.
 *
 * Usage (from starters/blog/):
 *   pnpm seed | wrangler d1 execute mantle-blog-local --local --file=/dev/stdin
 *
 * Or simpler:
 *   pnpm seed > .seed.sql && wrangler d1 execute mantle-blog-local --local --file=.seed.sql
 */

const NOW = Date.now();
const AUTHOR = "u-staff-1";

interface PostSeed {
  readonly slug: string;
  readonly coverUrl: string;
  readonly translations: ReadonlyArray<{
    readonly locale: string;
    readonly title: string;
    readonly body: string;
  }>;
}

const POSTS: readonly PostSeed[] = [
  {
    slug: "hello-world",
    coverUrl: "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=1200",
    translations: [
      {
        locale: "en",
        title: "Hello, world",
        body: "This is the first post on the Mantle blog. Localized content rendered from KV; the body is plain markdown for v0.1.0 (real markdown rendering arrives in starter v2).",
      },
      {
        locale: "zh-TW",
        title: "你好，世界",
        body: "這是 Mantle blog 的第一篇文章。內容從 KV 渲染、依語系切版；v0.1.0 的 body 暫以純文字呈現，正式 markdown 渲染留給 starter v2。",
      },
    ],
  },
  {
    slug: "lifecycle-hooks",
    coverUrl: "https://images.unsplash.com/photo-1518655048521-f130df041f66?w=1200",
    translations: [
      {
        locale: "en",
        title: "Lifecycle hooks: zero LOC abuse-prevention",
        body: "The contact form ships with a `before_create` hook that runs CAPTCHA verification, and an `after_create` hook that fires a Slack notification. Both are declared in YAML; the runtime decorator wraps every entry-writer mutation, so MCP, admin, and builtin paths all fire identically.",
      },
      {
        locale: "zh-TW",
        title: "生命週期鉤子：零行程式碼的防濫用",
        body: "聯絡表單內建 `before_create` 鉤子做 CAPTCHA 驗證、`after_create` 鉤子推 Slack 通知。兩者都在 YAML 宣告；runtime decorator 包住每一次 entry 寫入，MCP / admin / builtin 三條路徑全部觸發。",
      },
    ],
  },
  {
    slug: "translates-by-slug",
    coverUrl: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=1200",
    translations: [
      {
        locale: "en",
        title: "Translates: parent-child i18n",
        body: "Posts are language-neutral — slug, cover image, author, publish time. Translations live in a child Schema joined on slug. Boot validation refuses any translation row whose slug isn't a published post.",
      },
      {
        locale: "zh-TW",
        title: "Translates：parent-child 多語系",
        body: "Posts 不分語系，只放 slug、封面、作者、發佈時間。各語系版本放在 child Schema、靠 slug 對應。Boot 驗證會擋掉沒有對應 post 的翻譯列。",
      },
    ],
  },
];

function escape(s: string): string {
  return s.replace(/'/g, "''");
}

function render(): string {
  const lines: string[] = [];
  lines.push("-- starters/blog seed (idempotent). Re-runnable: every INSERT uses OR IGNORE.");
  lines.push("BEGIN TRANSACTION;");

  // site_config (brand / canonical locales / origin).
  for (const [key, value] of Object.entries({
    brand: "Mantle Blog",
    title: "Mantle Blog",
    description: "Reference starter for mantle — localized posts + contact form.",
    origin: "http://localhost:8787",
    locales: "en,zh-TW",
  })) {
    lines.push(
      `INSERT OR IGNORE INTO site_config (key, value) VALUES ('${escape(key)}', '${escape(value)}');`,
    );
  }

  // Staff author user (pure stub — admin UI / login flow lands later).
  lines.push(
    `INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES ('${AUTHOR}', 'editor@example.com', 'Demo Editor', ${NOW});`,
  );
  lines.push(
    `INSERT OR IGNORE INTO staff (user_id, role, granted_by, granted_at) VALUES ('${AUTHOR}', 'editor', NULL, ${NOW});`,
  );

  // posts (parent) + post-translations (children).
  let id = 1;
  for (const post of POSTS) {
    const postId = `seed-post-${id++}`;
    const data = JSON.stringify({
      slug: post.slug,
      coverUrl: post.coverUrl,
      authorId: AUTHOR,
      publishedAt: NOW,
    });
    lines.push(
      `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${postId}', 'posts', 'published', 1, '${escape(data)}', '${AUTHOR}', ${NOW}, ${NOW});`,
    );
    for (const tr of post.translations) {
      const trId = `seed-pt-${post.slug}-${tr.locale.toLowerCase()}`;
      const trData = JSON.stringify({
        slug: post.slug,
        locale: tr.locale,
        title: tr.title,
        body: tr.body,
      });
      lines.push(
        `INSERT OR IGNORE INTO entries (id, collection, status, version, data, author_id, created_at, updated_at) VALUES ('${trId}', 'post-translations', 'published', 1, '${escape(trData)}', '${AUTHOR}', ${NOW}, ${NOW});`,
      );
    }
  }

  lines.push("COMMIT;");
  return lines.join("\n") + "\n";
}

process.stdout.write(render());

import type { SiteConfig } from "@aotter/mantle-spec";

/**
 * Fixture data for the starter's integration tests + local-dev demo.
 * Stable timestamp + ids so subsequent fixture applies are
 * idempotent. Distinct from a "production seed" — this is example
 * content the starter ships for development, not data a real
 * consumer should keep.
 */
export const FIXTURE_NOW = 1_730_000_000_000;
export const FIXTURE_AUTHOR_ID = "u-staff-1";

export const FIXTURE_SITE: SiteConfig = {
  brand: "Mantle Blog",
  title: "Mantle Blog",
  description: "Reference starter for mantle — localized posts + contact form.",
  origin: "http://localhost:8787",
  locales: ["en", "zh-TW"],
  canonicalLocale: "en",
};

export interface FixturePost {
  readonly slug: string;
  readonly coverUrl: string;
  readonly translations: ReadonlyArray<{
    readonly locale: string;
    readonly title: string;
    readonly body: string;
  }>;
}

export const FIXTURE_POSTS: readonly FixturePost[] = [
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

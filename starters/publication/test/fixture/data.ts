import type { SiteConfig } from "@aotterclam/clam-cms-spec";

/**
 * Fixture data for the starter's integration tests + local-dev demo.
 * Stable timestamp + ids so subsequent fixture applies are
 * idempotent. Distinct from a "production seed" — this is example
 * content the starter ships for development, not data a real
 * consumer should keep.
 */
export const FIXTURE_NOW = 1_730_000_000_000;
export const FIXTURE_AUTHOR_ID = "u-staff-1";

/** Pre-minted Better Auth MCP bearer the test fixture seeds into
 *  `oauthAccessToken`. Smoke tests authenticate as `u-staff-1` (role
 *  'editor') by sending `Authorization: Bearer ${FIXTURE_MCP_ACCESS_TOKEN}`. */
export const FIXTURE_MCP_CLIENT_ID = "fixture-mcp-client";
export const FIXTURE_MCP_ACCESS_TOKEN = "fixture-mcp-access-token";
export const FIXTURE_MCP_REFRESH_TOKEN = "fixture-mcp-refresh-token";

export const FIXTURE_SITE: SiteConfig = {
  brand: "Clam Publication",
  title: "Clam Publication",
  description: "Reference starter for clam-cms — localized posts + contact form.",
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
        body: "This is the first post on the Clam publication. Localized content rendered from KV; the body is plain markdown for v0.1.0 (real markdown rendering arrives in starter v2).",
      },
      {
        locale: "zh-TW",
        title: "你好，世界",
        body: "這是 Clam publication 的第一篇文章。內容從 KV 渲染、依語系切版；v0.1.0 的 body 暫以純文字呈現，正式 markdown 渲染留給 starter v2。",
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

export interface FixturePage {
  readonly slug: string;
  readonly translations: ReadonlyArray<{
    readonly locale: string;
    readonly title: string;
    readonly intro?: string;
    readonly body: string;
  }>;
}

export const FIXTURE_PAGES: readonly FixturePage[] = [
  {
    slug: "home",
    translations: [
      {
        locale: "en",
        title: "Welcome to Clam Publication",
        intro: "Localized posts + contact form, served from Cloudflare D1 + KV.",
        body: "This site is the v0.1.0 reference starter for clam-cms. It exercises every locked grammar feature: posts (language-neutral parent), post-translations (translates demo), pages (this page is one), and a CAPTCHA-gated contact form running on lifecycle hooks. Recent posts are listed below; About + Contact pages are reachable from the header.",
      },
      {
        locale: "zh-TW",
        title: "歡迎來到 Clam Publication",
        intro: "多語系文章 + 聯絡表單，跑在 Cloudflare D1 + KV 上。",
        body: "這個網站是 clam-cms v0.1.0 的範本 starter。Locked grammar 全跑一遍：posts（語系無關的 parent）、post-translations（translates demo）、pages（這頁就是其中一個）、以及一個用 lifecycle hooks 過 CAPTCHA 的聯絡表單。最新文章列在下面；標頭可以連到 About / Contact。",
      },
    ],
  },
  {
    slug: "about",
    translations: [
      {
        locale: "en",
        title: "About",
        intro: "What this starter is for.",
        body: "Clam Publication is a reference deployment of the clam-cms v0.1.0 manifest engine on Cloudflare Workers. It demonstrates the four locked atoms — Schema, View, Procedure, Trigger — composed into a real, runnable site. Source: github.com/AotterClam/clam-cms.",
      },
      {
        locale: "zh-TW",
        title: "關於",
        intro: "這個 starter 的用途。",
        body: "Clam Publication 是 clam-cms v0.1.0 manifest 引擎跑在 Cloudflare Workers 上的範例佈署。它把四個 locked atom（Schema、View、Procedure、Trigger）組成一個真的能跑的網站。原始碼：github.com/AotterClam/clam-cms。",
      },
    ],
  },
  {
    slug: "contact",
    translations: [
      {
        locale: "en",
        title: "Contact",
        intro: "Send us a message.",
        body: "POST to `/api/contact` with name, email, message, and a CAPTCHA token. The before_create lifecycle hook verifies the token; valid submissions land in the contact-messages collection and trigger an after_create notification.",
      },
      {
        locale: "zh-TW",
        title: "聯絡",
        intro: "傳訊息給我們。",
        body: "POST 到 `/api/contact`，帶上 name、email、message 和 CAPTCHA token。before_create lifecycle hook 會驗證 token；通過的訊息進 contact-messages collection，並觸發 after_create 通知。",
      },
    ],
  },
];

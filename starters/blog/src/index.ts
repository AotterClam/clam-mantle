import { Hono } from "hono";
import type { ContentState, Entry, SiteConfig } from "@aotterclam/clam-cms-spec";
import {
  readEntryBySlug,
  readPublishedEntries,
  renderEntryHtml,
  renderListHtml,
} from "@aotterclam/clam-cms-runtime";
import {
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type CmsRuntimeRef,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";
import { publicPathFor } from "./paths.js";
import {
  contactTemplate,
  homeTemplate,
  notFoundTemplate,
} from "./templates/index.js";

/**
 * Worker entrypoint. Lives at `wrangler.toml`'s `main`.
 *
 * Public read path serves pre-rendered HTML from KV (the publish
 * pipeline writes there at publish time). The home + 404 surfaces
 * are request-time-composed.
 *
 * URL surface:
 *   GET  /                       302 → /{canonicalLocale}
 *   GET  /{locale}               home (composed: pages/home + recent posts)
 *   GET  /{locale}/posts         per-locale post index
 *   GET  /{locale}/posts/{slug}  post entry HTML
 *   GET  /{locale}/pages/{slug}  static page entry HTML (about, …)
 *                                — `contact` is special-cased to a
 *                                  request-time template that embeds
 *                                  the Turnstile widget + form
 *   GET  /{locale}/llms.txt      per-locale llms.txt
 *   GET  /llms.txt               root llms.txt (non-localized aggregate)
 *   GET  /sitemap.xml            cross-locale + cross-collection urlset
 *   POST /api/contact            builtin Procedure (CAPTCHA-gated)
 *   GET  /api/views/<name>       per-View public REST (ADR-0012)
 *   ALL  /mcp                    MCP JSON-RPC dispatcher
 *
 * Preview mode: append `?preview=1` to any post / page URL to bypass
 * KV and render via the registered template at request time —
 * useful when iterating on templates without re-running the publish
 * pipeline. Also surfaces `status: draft` rows so authors can preview
 * unpublished work.
 */
let appRef: { app: Hono; cms: CmsRuntimeRef } | null = null;

function getApp(env: Env): { app: Hono; cms: CmsRuntimeRef } {
  if (appRef) return appRef;
  const cms = createCmsRef(buildCmsConfig(env));
  const app = new Hono();

  mountServerEndpoints(app, cms);
  mountMcp(app, cms);

  app.get("/", async (c) => {
    const canonical = siteConfigFromEnv(env).canonicalLocale ?? "en";
    return c.redirect(`/${canonical}`);
  });

  // Literal root paths register BEFORE the `/:locale` catch-all —
  // otherwise Hono's trie matches `/llms.txt` as `:locale = "llms.txt"`
  // and the locale check 404s before the literal handler ever sees it.
  app.get("/llms.txt", async () => readKv(env, `llms:root`, "text/plain"));
  app.get("/sitemap.xml", async () => {
    const runtime = await cms.get();
    const xml = await runtime.composeSitemap.execute({
      site: siteConfigFromEnv(env),
      pathFor: publicPathFor,
    });
    return new Response(xml, {
      status: 200,
      headers: {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  });

  app.get("/:locale", async (c) => {
    const { locale } = c.req.param();
    const site = siteConfigFromEnv(env);
    const localesLower = site.locales.map((l) => l.toLowerCase());
    if (!localesLower.includes(locale.toLowerCase())) {
      return notFound(env, locale);
    }

    const runtime = await cms.get();
    const [all, recent] = await Promise.all([
      runtime.listEntries.execute({
        collection: "page-translations",
        status: "published",
        limit: 50,
      }),
      runtime.listEntries.execute({
        collection: "post-translations",
        status: "published",
        limit: 5,
      }),
    ]);
    const homeEntry = all.find(
      (e) =>
        (e.data as { slug?: string }).slug === "home" &&
        (e.data as { locale?: string }).locale === locale,
    );
    if (!homeEntry) {
      return notFound(env, locale);
    }
    const recentForLocale = recent
      .filter((e) => (e.data as { locale?: string }).locale === locale)
      .map<Entry>((e) => ({
        id: e.id,
        collection: e.collection,
        locale: e.locale,
        status: e.status,
        version: e.version,
        data: e.data,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }));

    const homeData = homeEntry.data as {
      title?: string;
      intro?: string;
      body?: string;
    };
    const html = homeTemplate({
      site,
      locale,
      home: {
        title: homeData.title ?? site.brand ?? "Home",
        intro: homeData.intro,
        body: homeData.body ?? "",
      },
      recentPosts: recentForLocale,
    });
    return new Response(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=60, s-maxage=60",
      },
    });
  });

  app.get("/:locale/posts/:slug", async (c) => {
    const { locale, slug } = c.req.param();
    if (c.req.query("preview") === "1") {
      return previewEntry(env, cms, "post-translations", locale, slug);
    }
    if (isLocalDev(env)) {
      return liveRenderEntry(env, cms, "post-translations", locale, slug);
    }
    return readKvOrFallback(
      env,
      `entry:html:${locale.toLowerCase()}/post-translations/${slug}`,
      "text/html",
      locale,
    );
  });
  app.get("/:locale/posts", async (c) => {
    const { locale } = c.req.param();
    if (isLocalDev(env)) {
      return liveRenderList(env, cms, "post-translations", locale);
    }
    return readKvOrFallback(
      env,
      `list:html:${locale.toLowerCase()}/post-translations`,
      "text/html",
      locale,
    );
  });
  app.get("/:locale/pages/:slug", async (c) => {
    const { locale, slug } = c.req.param();
    if (slug === "contact") {
      return renderContact(env, cms, locale);
    }
    if (c.req.query("preview") === "1") {
      return previewEntry(env, cms, "page-translations", locale, slug);
    }
    if (isLocalDev(env)) {
      return liveRenderEntry(env, cms, "page-translations", locale, slug);
    }
    return readKvOrFallback(
      env,
      `entry:html:${locale.toLowerCase()}/page-translations/${slug}`,
      "text/html",
      locale,
    );
  });
  app.get("/:locale/llms.txt", async (c) =>
    readKv(env, `llms:${c.req.param("locale").toLowerCase()}`, "text/plain"),
  );

  app.notFound((c) => notFound(env, inferLocale(c.req.path, env)));

  appRef = { app, cms };
  return appRef;
}

/** On miss, render the localized 404 template — bare "not found"
 *  text would be misread as CMS content by the public reader. */
async function readKvOrFallback(
  env: Env,
  key: string,
  contentType: string,
  locale: string,
): Promise<Response> {
  const body = await env.KV.get(key, "text");
  if (body === null) {
    return notFound(env, locale);
  }
  return new Response(body, {
    status: 200,
    headers: { "content-type": `${contentType}; charset=utf-8` },
  });
}

/** Plain-text 404 sibling to `readKvOrFallback`. Used only for the
 *  `llms.txt` routes — those are machine-readable surfaces where an
 *  HTML 404 page would break clients. */
async function readKv(env: Env, key: string, contentType: string): Promise<Response> {
  const body = await env.KV.get(key, "text");
  if (body === null) {
    return new Response("not found", { status: 404 });
  }
  return new Response(body, {
    status: 200,
    headers: { "content-type": `${contentType}; charset=utf-8` },
  });
}

function isLocalDev(env: Env): boolean {
  return env.CLAM_LOCAL_DEV === "1";
}

const HTML_NO_STORE = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
} as const;

/** Live-render a published entry via the registered template against
 *  current D1 state. Wired only when `CLAM_LOCAL_DEV=1` so chrome
 *  edits show without re-fixturing. Production uses the KV-cached
 *  path instead. */
async function liveRenderEntry(
  env: Env,
  cms: CmsRuntimeRef,
  collection: "post-translations" | "page-translations",
  locale: string,
  slug: string,
): Promise<Response> {
  const runtime = await cms.get();
  const entry = await readEntryBySlug(runtime.db, {
    collection,
    slug,
    locale,
    status: "published",
  });
  if (!entry) return notFound(env, locale);
  const html = renderEntryHtml({
    entry,
    site: siteConfigFromEnv(env),
    templates: runtime.templates,
  });
  if (html === null) return notFound(env, locale);
  return new Response(html, { status: 200, headers: HTML_NO_STORE });
}

async function liveRenderList(
  env: Env,
  cms: CmsRuntimeRef,
  collection: "post-translations" | "page-translations",
  locale: string,
): Promise<Response> {
  const runtime = await cms.get();
  const entries = await readPublishedEntries(runtime.db, { collection, locale });
  const html = renderListHtml({
    collection,
    locale,
    entries,
    site: siteConfigFromEnv(env),
    templates: runtime.templates,
  });
  if (html === null) return notFound(env, locale);
  return new Response(html, { status: 200, headers: HTML_NO_STORE });
}

const PREVIEW_STATUS_ORDER: ReadonlyArray<ContentState> = ["draft", "published", "archived"];

/** `?preview=1` route. Looks up the entry preferring draft, falling
 *  back to published, then archived; renders via the registered
 *  template; injects a preview banner just inside `<body>`. */
async function previewEntry(
  env: Env,
  cms: CmsRuntimeRef,
  collection: "post-translations" | "page-translations",
  locale: string,
  slug: string,
): Promise<Response> {
  const runtime = await cms.get();
  let entry: Entry | null = null;
  for (const status of PREVIEW_STATUS_ORDER) {
    entry = await readEntryBySlug(runtime.db, { collection, slug, locale, status });
    if (entry) break;
  }
  if (!entry) return notFound(env, locale);
  const html = renderEntryHtml({
    entry,
    site: siteConfigFromEnv(env),
    templates: runtime.templates,
  });
  if (html === null) return notFound(env, locale);
  const banner = `<div class="preview-banner">Preview · ${entry.status} · ${slug}</div>`;
  return new Response(html.replace(/<body([^>]*)>/, `<body$1>${banner}`), {
    status: 200,
    headers: HTML_NO_STORE,
  });
}

async function renderContact(
  env: Env,
  cms: CmsRuntimeRef,
  locale: string,
): Promise<Response> {
  const site = siteConfigFromEnv(env);
  const localesLower = site.locales.map((l) => l.toLowerCase());
  if (!localesLower.includes(locale.toLowerCase())) {
    return notFound(env, locale);
  }
  const runtime = await cms.get();
  const all = await runtime.listEntries.execute({
    collection: "page-translations",
    status: "published",
    limit: 50,
  });
  const entry = all.find(
    (e) =>
      (e.data as { slug?: string }).slug === "contact" &&
      (e.data as { locale?: string }).locale === locale,
  );
  const data = (entry?.data ?? {}) as { title?: string; intro?: string; body?: string };
  const html = contactTemplate({
    site,
    locale,
    page: {
      title: data.title ?? "",
      intro: data.intro,
      body: data.body ?? "",
    },
    turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA",
  });
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Site key + form embedded — short edge cache is fine. Real
      // submission goes through POST /api/contact (no caching there).
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}

async function notFound(env: Env, locale: string): Promise<Response> {
  const site = siteConfigFromEnv(env);
  const html = notFoundTemplate({ site, locale: locale || site.canonicalLocale || "en" });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Memoized to avoid `buildCmsConfig`'s per-call port allocation.
let cachedSite: SiteConfig | null = null;
function siteConfigFromEnv(env: Env): SiteConfig {
  if (cachedSite) return cachedSite;
  const defaults = buildCmsConfig(env).siteDefaults!;
  cachedSite = {
    brand: defaults.brand ?? "",
    title: defaults.title ?? defaults.brand ?? "",
    description: defaults.description ?? "",
    origin: defaults.origin ?? "",
    locales: [...(defaults.locales ?? [])],
    canonicalLocale: defaults.locales?.[0] ?? null,
  };
  return cachedSite;
}

function inferLocale(path: string, env: Env): string {
  const site = siteConfigFromEnv(env);
  const candidates = site.locales.map((l) => l.toLowerCase());
  const seg = path.split("/")[1] ?? "";
  if (seg && candidates.includes(seg.toLowerCase())) return seg;
  return site.canonicalLocale ?? "en";
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { app } = getApp(env);
    return app.fetch(req, env, ctx);
  },
};

import { Hono } from "hono";
import type { Entry, SiteConfig } from "@aotterclam/clam-cms-spec";
import {
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type CmsRuntimeRef,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";
import { homeTemplate, notFoundTemplate } from "./templates/index.js";

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
 *   GET  /{locale}/pages/{slug}  static page entry HTML (about, contact, …)
 *   GET  /{locale}/llms.txt      per-locale llms.txt
 *   GET  /llms.txt               root llms.txt
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
    return readKvOrFallback(
      env,
      `entry:html:${locale.toLowerCase()}/post-translations/${slug}`,
      "text/html",
      locale,
    );
  });
  app.get("/:locale/posts", async (c) => {
    const { locale } = c.req.param();
    return readKvOrFallback(
      env,
      `list:html:${locale.toLowerCase()}/post-translations`,
      "text/html",
      locale,
    );
  });
  app.get("/:locale/pages/:slug", async (c) => {
    const { locale, slug } = c.req.param();
    if (c.req.query("preview") === "1") {
      return previewEntry(env, cms, "page-translations", locale, slug);
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

/** Read pre-rendered HTML from KV; on miss, render the localized 404
 *  template instead of returning bare "not found" text. */
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

/** Render the registered entry template for a (collection, slug,
 *  locale) at request time, regardless of `status`. Skips KV. */
const PREVIEW_STATUS_PRIORITY: Record<string, number> = {
  draft: 0,
  published: 1,
  archived: 2,
};

async function previewEntry(
  env: Env,
  cms: CmsRuntimeRef,
  collection: "post-translations" | "page-translations",
  locale: string,
  slug: string,
): Promise<Response> {
  const runtime = await cms.get();
  const tpl = runtime.templates.getEntryTemplate(collection);
  if (!tpl) return notFound(env, locale);
  const all = await runtime.listEntries.execute({ collection, limit: 200 });
  // Preview prefers the in-progress draft over a published copy of the
  // same (slug, locale); fall back to published, then archived.
  const matches = all
    .filter(
      (e) =>
        (e.data as { slug?: string }).slug === slug &&
        (e.data as { locale?: string }).locale === locale,
    )
    .sort((a, b) => {
      const pa = PREVIEW_STATUS_PRIORITY[a.status] ?? 99;
      const pb = PREVIEW_STATUS_PRIORITY[b.status] ?? 99;
      if (pa !== pb) return pa - pb;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  const entry = matches[0];
  if (!entry) return notFound(env, locale);
  const site = siteConfigFromEnv(env);
  const body = tpl({
    entry: {
      id: entry.id,
      collection: entry.collection,
      locale: entry.locale,
      status: entry.status,
      version: entry.version,
      data: entry.data,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    },
    site,
  });
  // Inject the preview banner just after <body>. The registered
  // template doesn't know about preview mode; doing this here keeps
  // EntryContext free of a worker-only flag and avoids forking the
  // template just for a 1-line UI cue.
  // Registered templates omit the doctype (the publish pipeline adds
  // it before KV write). Preview bypasses publish, so prepend here.
  const banner = `<div class="preview-banner">Preview · ${entry.status} · ${slug}</div>`;
  const html =
    "<!doctype html>" + body.replace(/<body([^>]*)>/, `<body$1>${banner}`);
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
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

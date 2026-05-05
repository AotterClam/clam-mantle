import { Hono } from "hono";
import type { Entry, SiteConfig } from "@aotter/mantle-spec";
import {
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type CmsRuntimeRef,
} from "@aotter/mantle-cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";
import { homeTemplate } from "./templates/index.js";

/**
 * Worker entrypoint. Lives at `wrangler.toml`'s `main`.
 *
 * Two long-lived per-isolate bindings:
 *  - `app`: the Hono router (stateless beyond closure capture)
 *  - `cmsRef`: the `CmsRuntimeRef` returned by `createCmsRef`. Carries
 *    the boot-cached runtime; reused across requests within an
 *    isolate. Built lazily on first request so the worker doesn't pay
 *    boot cost on warm CPU init.
 *
 * Public read path serves pre-rendered HTML from KV (the publish
 * pipeline writes there at publish time). Layout:
 *   GET  /                       → 302 to /{canonicalLocale}
 *   GET  /{locale}               → home page (composes pages/home + recent posts)
 *   GET  /{locale}/posts         → per-locale post index
 *   GET  /{locale}/posts/{slug}  → post entry HTML
 *   GET  /{locale}/pages/{slug}  → static page entry HTML (about, contact, …)
 *   GET  /llms.txt               → llms.txt root
 *   GET  /{locale}/llms.txt      → llms.txt per locale
 *   POST /api/contact            → builtin Procedure (CAPTCHA-gated)
 *   ALL  /mcp                    → MCP JSON-RPC dispatcher
 *
 * The home route is the only request-time-composed surface — it
 * fetches the `slug = "home"` page-translation from KV and joins it
 * with a small recent-posts list. Everything else is a single KV
 * read of pre-rendered HTML.
 */
let appRef: { app: Hono; cms: CmsRuntimeRef } | null = null;

function getApp(env: Env): { app: Hono; cms: CmsRuntimeRef } {
  if (appRef) return appRef;
  const cms = createCmsRef(buildCmsConfig(env));
  const app = new Hono();

  mountServerEndpoints(app, cms);
  mountMcp(app, cms);

  // Root → canonical locale (cheap redirect, no KV read).
  app.get("/", async (c) => {
    const canonical = buildCmsConfig(env).siteDefaults?.locales?.[0] ?? "en";
    return c.redirect(`/${canonical}`);
  });

  // Literal root paths register BEFORE the `/:locale` catch-all —
  // otherwise Hono's trie matches `/llms.txt` as `:locale = "llms.txt"`
  // and the locale check 404s before the literal handler ever sees it.
  app.get("/llms.txt", async () => readKv(env, `llms:root`, "text/plain"));

  // Per-locale home — composed at request time from
  // `pages/home`'s translation + a recent-posts list. The home
  // template itself lives in src/templates/home.tsx and is NOT
  // registered to the publish pipeline (it crosses collections).
  app.get("/:locale", async (c) => {
    const { locale } = c.req.param();
    const config = buildCmsConfig(env);
    const localesLower = (config.siteDefaults?.locales ?? []).map((l) => l.toLowerCase());
    if (!localesLower.includes(locale.toLowerCase())) {
      return new Response("not found", { status: 404 });
    }

    // Cheap path: fetch the home translation row's data via the
    // entry-list KV key the publish pipeline writes. We index by
    // slug=home directly via the runtime use case rather than via
    // KV (the entry data shape is what we want, not pre-rendered
    // HTML — the home page is composed, not pre-baked).
    const runtime = await cms.get();
    const all = await runtime.listEntries.execute({
      collection: "page-translations",
      status: "published",
      limit: 50,
    });
    const homeEntry = all.find(
      (e) =>
        (e.data as { slug?: string }).slug === "home" &&
        (e.data as { locale?: string }).locale === locale,
    );
    if (!homeEntry) {
      return new Response("home page not published yet", { status: 404 });
    }

    const recent = await runtime.listEntries.execute({
      collection: "post-translations",
      status: "published",
      limit: 5,
    });
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
    const defaults = config.siteDefaults!;
    const site: SiteConfig = {
      brand: defaults.brand ?? "",
      title: defaults.title ?? defaults.brand ?? "",
      description: defaults.description ?? "",
      origin: defaults.origin ?? "",
      locales: [...(defaults.locales ?? [])],
      canonicalLocale: defaults.locales?.[0] ?? null,
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
    return readKv(env, `entry:html:${locale.toLowerCase()}/post-translations/${slug}`, "text/html");
  });
  app.get("/:locale/posts", async (c) => {
    const { locale } = c.req.param();
    return readKv(env, `list:html:${locale.toLowerCase()}/post-translations`, "text/html");
  });
  app.get("/:locale/pages/:slug", async (c) => {
    const { locale, slug } = c.req.param();
    return readKv(env, `entry:html:${locale.toLowerCase()}/page-translations/${slug}`, "text/html");
  });
  app.get("/:locale/llms.txt", async (c) =>
    readKv(env, `llms:${c.req.param("locale").toLowerCase()}`, "text/plain"),
  );

  appRef = { app, cms };
  return appRef;
}

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

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { app } = getApp(env);
    return app.fetch(req, env, ctx);
  },
};

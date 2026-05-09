import { Hono } from "hono";
import type { Entry } from "@aotterclam/clam-cms-spec";
import {
  createAuth,
  createCmsRef,
  mountMcp,
  mountPublicRoutes,
  mountServerEndpoints,
  type Auth,
  type PublicRouteContext,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";
import {
  contactTemplate,
  homeTemplate,
  notFoundTemplate,
} from "./theme.default/templates/index.js";

/**
 * Worker entrypoint. Lives at `wrangler.toml`'s `main`.
 *
 * The SDK's `mountPublicRoutes` registers every routine public
 * surface (post / page / list / `.md` mirror / llms.txt / sitemap /
 * preview / live-dev). This file handles only the consumer-specific
 * pieces:
 *
 *   - `homeRenderer`     — composes `/{locale}` from page + recent posts
 *   - `notFoundRenderer` — locale-aware 404
 *   - `slugOverrides`    — `pages/contact` swaps in the Turnstile form
 *
 * Everything else (route ordering, KV key derivation, preview-banner
 * injection, SEO/AEO meta composition) is SDK-managed.
 */
let appCache: Hono | null = null;
let authCache: Auth | null = null;

function getAuth(env: Env): Auth | null {
  if (authCache) return authCache;
  // Better Auth runs only when its required env is present. Dev boxes
  // that haven't set BETTER_AUTH_SECRET yet boot fine without auth —
  // the `/api/auth/*` route just returns 503 (see fetch handler).
  if (!env.BETTER_AUTH_SECRET) return null;
  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
  authCache = createAuth({
    database: env.DB,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    github:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
            // Match the existing GitHub OAuth App's registered
            // callback URL. The translator route below funnels the
            // request to Better Auth's actual handler.
            redirectURI: `${baseURL}/admin/auth/github/callback`,
          }
        : undefined,
    adminGithubLogin: env.ADMIN_GITHUB_LOGIN,
  });
  return authCache;
}

function getApp(env: Env): Hono {
  if (appCache) return appCache;
  const config = buildCmsConfig(env);
  const cms = createCmsRef(config);
  const app = new Hono();

  // Better Auth handler at /api/auth/* — owns sign-in / sign-out /
  // OAuth callbacks / session reads / MCP DCR endpoints (per ADR-0014).
  app.all("/api/auth/*", async (c) => {
    const auth = getAuth(env);
    if (!auth) {
      return c.json(
        {
          error: "auth_not_configured",
          message:
            "Better Auth requires BETTER_AUTH_SECRET. Run `wrangler secret put BETTER_AUTH_SECRET` and redeploy.",
        },
        503,
      );
    }
    return auth.handler(c.req.raw);
  });

  // Path translator for the legacy GitHub OAuth callback URL. The
  // existing GitHub OAuth App is registered with
  // `/admin/auth/github/callback` as its authorization callback URL;
  // GitHub rejects mismatches with "Invalid Redirect URI". This route
  // accepts the callback at the legacy path and rewrites the request
  // URL to Better Auth's expected `/api/auth/callback/github` shape
  // before delegating to `auth.handler`. Once the GitHub OAuth App
  // gets its callback URL updated to the canonical Better Auth path,
  // delete this route.
  app.get("/admin/auth/github/callback", async (c) => {
    const auth = getAuth(env);
    if (!auth) return c.json({ error: "auth_not_configured" }, 503);
    const url = new URL(c.req.url);
    url.pathname = "/api/auth/callback/github";
    const translated = new Request(url.toString(), {
      method: "GET",
      headers: c.req.raw.headers,
      redirect: "manual",
    });
    return auth.handler(translated);
  });

  mountServerEndpoints(app, cms);
  mountMcp(app, cms);
  mountPublicRoutes(app, cms, {
    collectionRoutes: [
      { collection: "post-translations", segment: "posts", listRoute: true },
      { collection: "page-translations", segment: "pages", homeSlug: "home" },
    ],
    homeRenderer: renderHome,
    notFoundRenderer: renderNotFound,
    slugOverrides: [
      {
        collection: "page-translations",
        slug: "contact",
        render: (ctx) => renderContact(ctx, env),
      },
    ],
    liveDev: env.CLAM_LOCAL_DEV === "1",
  });

  appCache = app;
  return app;
}

async function renderHome(ctx: PublicRouteContext): Promise<Response> {
  const { runtime, site, locale } = ctx;
  const [pages, recent] = await Promise.all([
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
  const homeEntry = pages.find(
    (e) =>
      (e.data as { slug?: string }).slug === "home" &&
      (e.data as { locale?: string }).locale === locale,
  );
  if (!homeEntry) return renderNotFound(ctx);

  const recentForLocale: Entry[] = recent.filter(
    (e) => (e.data as { locale?: string }).locale === locale,
  );

  const data = homeEntry.data as { title?: string; intro?: string; body?: string };
  const html = homeTemplate({
    site,
    locale,
    home: {
      title: data.title ?? site.brand ?? "Home",
      intro: data.intro,
      body: data.body ?? "",
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
}

async function renderContact(ctx: PublicRouteContext, env: Env): Promise<Response> {
  const { runtime, site, locale } = ctx;
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
      "cache-control": "public, max-age=60, s-maxage=60",
    },
  });
}

async function renderNotFound(ctx: PublicRouteContext): Promise<Response> {
  const { site, locale } = ctx;
  const html = notFoundTemplate({ site, locale: locale || site.canonicalLocale || "en" });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return getApp(env).fetch(req, env, ctx);
  },
};

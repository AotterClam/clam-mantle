import { Hono } from "hono";
import {
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type CmsRuntimeRef,
} from "@aotter/mantle-cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";

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
 *   GET  /{locale}/posts/{slug}  → entry HTML
 *   GET  /{locale}/posts         → per-locale index
 *   GET  /llms.txt               → llms.txt root
 *   GET  /{locale}/llms.txt      → llms.txt per locale
 *   POST /api/contact            → builtin Procedure (CAPTCHA-gated)
 *   ALL  /mcp                    → MCP JSON-RPC dispatcher
 */
let appRef: { app: Hono; cms: CmsRuntimeRef } | null = null;

function getApp(env: Env): { app: Hono; cms: CmsRuntimeRef } {
  if (appRef) return appRef;
  const cms = createCmsRef(buildCmsConfig(env));
  const app = new Hono();

  mountServerEndpoints(app, cms);
  mountMcp(app, cms);

  app.get("/:locale/posts/:slug", async (c) => {
    const { locale, slug } = c.req.param();
    return readKv(env, `entry:html:${locale.toLowerCase()}/post-translations/${slug}`, "text/html");
  });
  app.get("/:locale/posts", async (c) => {
    const { locale } = c.req.param();
    return readKv(env, `list:html:${locale.toLowerCase()}/post-translations`, "text/html");
  });
  app.get("/llms.txt", async () => readKv(env, `llms:`, "text/plain"));
  app.get("/:locale/llms.txt", async (c) =>
    readKv(env, `llms:${c.req.param("locale").toLowerCase()}`, "text/plain"),
  );

  app.get("/", async (c) => {
    const canonical = buildCmsConfig(env).siteDefaults?.locales?.[0] ?? "en";
    return c.redirect(`/${canonical}/posts`);
  });

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

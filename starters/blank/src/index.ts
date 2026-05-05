import { Hono } from "hono";
import {
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
} from "@aotterclam/clam-cms-cloudflare";
import { buildCmsConfig, type Env } from "./clamConfig.js";

/**
 * Headless worker entrypoint. Mounts only the API + MCP surfaces:
 *
 *   GET  /api/views/<name>          — view REST (auto-mounted per View atom)
 *   ALL  /api/<procedure>           — procedure dispatcher (POST/PUT/PATCH/DELETE)
 *   ALL  /mcp                       — MCP JSON-RPC dispatcher
 *
 * No `mountPublicRoutes` — this starter intentionally serves nothing
 * to end users. Wire your Next.js / Astro / SvelteKit / native app to
 * the API + MCP endpoints above.
 *
 * MCP auth is bearer-token-only via the runtime `OAuthVerifier` port
 * (StubOAuthVerifier behind `CLAM_ALLOW_STUB_OAUTH=1` for dev). No
 * `/oauth/{authorize,token,register}` route mount in v0.1.0; a
 * `@cloudflare/workers-oauth-provider` integration is v0.1.x.
 *
 * If you decide to render HTML on the server later, swap to
 * `starters/blog` (or copy its `mountPublicRoutes` setup back in).
 */
let appCache: Hono | null = null;

function getApp(env: Env): Hono {
  if (appCache) return appCache;
  const config = buildCmsConfig(env);
  const cms = createCmsRef(config);
  const app = new Hono();
  mountServerEndpoints(app, cms);
  mountMcp(app, cms);
  appCache = app;
  return app;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return getApp(env).fetch(req, env, ctx);
  },
};

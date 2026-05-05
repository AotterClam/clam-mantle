import { Hono } from "hono";
import {
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
} from "@aotter/mantle-cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";

/**
 * Headless worker entrypoint. Mounts only the API + MCP surfaces:
 *
 *   GET  /api/views/<name>          — view REST (auto-mounted per View atom)
 *   ALL  /api/<procedure>           — procedure dispatcher (POST/PUT/PATCH/DELETE)
 *   ALL  /mcp                       — MCP JSON-RPC dispatcher
 *   /oauth/{authorize,token,...}    — OAuth 2.1 / DCR for MCP clients
 *
 * No `mountPublicRoutes` — this starter intentionally serves nothing
 * to end users. Wire your Next.js / Astro / SvelteKit / native app to
 * the API + MCP endpoints above.
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

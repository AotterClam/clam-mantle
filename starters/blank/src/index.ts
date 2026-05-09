import { Hono } from "hono";
import {
  createAuth,
  createCmsRef,
  mountMcp,
  mountServerEndpoints,
  type Auth,
  type CreateAuthConfig,
} from "@aotter/mantle-cloudflare";
import { buildCmsConfig, type Env } from "./mantleConfig.js";

/** Headless worker entrypoint — API + MCP only, no rendered UI.
 *  Wire your own frontend to /api/views/* + /mcp + /api/auth/*. */
let appCache: Hono | null = null;

function buildAuthFromEnv(env: Env): Auth {
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error(
      "BETTER_AUTH_SECRET is required. Run `wrangler secret put BETTER_AUTH_SECRET`.",
    );
  }
  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";
  const github: CreateAuthConfig["github"] =
    env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
        }
      : undefined;
  return createAuth({
    database: env.DB,
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    github,
    adminGithubLogin: env.ADMIN_GITHUB_LOGIN,
  });
}

function getApp(env: Env): Hono {
  if (appCache) return appCache;
  const auth = buildAuthFromEnv(env);
  const cms = createCmsRef(buildCmsConfig(env, auth));
  const app = new Hono();
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));
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

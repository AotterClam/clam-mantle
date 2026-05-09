/**
 * Spike: Better Auth instance for the publication starter.
 *
 * Goal of this file (spike phase only): prove Better Auth boots on
 * Workers + D1 with admin plugin + mcp plugin, GitHub social provider,
 * and the ensureBootstrapOwner hook. The real refactor moves this into
 * `mantle-cloudflare/src/auth.ts` and threads the instance through
 * the runtime port; for now it lives in the consumer to keep the
 * spike scoped.
 *
 * Reference: ADR-0014.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, mcp } from "better-auth/plugins";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";
import type { Env } from "./mantleConfig.js";

/**
 * Closed enum of admin (staff) roles. Mirrors the existing
 * `ctx.staff: [...]` predicate vocabulary in manifest grammar.
 * Order = severity ascending (`contributor < editor < owner`).
 *
 * Better Auth's admin plugin wants a mutable `string[]` so we keep
 * the source-of-truth tuple readonly and spread when handing off.
 */
export const ADMIN_ROLES = ["contributor", "editor", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Build the Better Auth instance from the worker's env bindings.
 *
 * Singleton-per-isolate is the caller's job: this factory does the
 * Kysely + plugin wiring fresh each time. The worker entrypoint
 * caches the result the same way it caches `cms` / `app`.
 *
 * Return type opaque on purpose. Better Auth's inferred type pulls in
 * plugin internals (`MCPOptions`, `AdminOptions`, ...) that are not
 * re-exported from the package's public surface, so naming the full
 * inferred type breaks the .d.ts emit contract (TS4058). Callers use
 * `auth.handler(req)` and `auth.api.*` which are stable on the
 * returned object regardless of declared type.
 */
function buildAuth(env: Env) {
  // Spike: schema is unknown to Kysely until Better Auth generates
  // its migrations. Loose typing here is fine — Better Auth is the
  // only consumer of these tables, and it has its own internal
  // typed query builder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new Kysely<any>({
    dialect: new D1Dialect({ database: env.DB }),
  });

  const baseURL = env.PUBLIC_ORIGIN ?? "http://localhost:8787";

  return betterAuth({
    database: db,
    secret: env.BETTER_AUTH_SECRET ?? "dev-spike-secret-DO-NOT-USE-IN-PROD",
    baseURL,
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID ?? "",
        clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
        // Better Auth's GitHub provider stores `name` / `email` /
        // `image` on user. We need `login` (the GH handle) for
        // ADMIN_GITHUB_LOGIN comparison; pull it via mapProfileToUser.
        mapProfileToUser: (profile) => ({
          githubLogin: profile.login,
        }),
      },
    },
    user: {
      additionalFields: {
        githubLogin: {
          type: "string",
          required: false,
          input: false, // not user-settable on signup
        },
      },
    },
    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: [...ADMIN_ROLES], // mutate readonly tuple to plain string[]
      }),
      mcp({
        // Where Better Auth redirects unauthenticated MCP authorize
        // requests. The publication starter's sign-in view lives at
        // `/auth/sign-in` (rendered by the SDK admin SPA).
        loginPage: "/auth/sign-in",
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // ensureBootstrapOwner: first user matching ADMIN_GITHUB_LOGIN
            // env var is auto-promoted to `owner` if no owner exists yet.
            // Replaces the inline logic in the legacy
            // /admin/auth/github/callback handler.
            const adminGithubLogin = env.ADMIN_GITHUB_LOGIN;
            if (!adminGithubLogin) return;
            const u = user as { id: string; githubLogin?: string | null };
            if (u.githubLogin?.toLowerCase() !== adminGithubLogin.toLowerCase()) return;

            const ownerExists = await db
              .selectFrom("user")
              .select("id")
              .where("role", "=", "owner")
              .limit(1)
              .execute();
            if (ownerExists.length > 0) return;

            await db
              .updateTable("user")
              .set({ role: "owner" })
              .where("id", "=", u.id)
              .execute();
          },
        },
      },
    },
  } satisfies BetterAuthOptions);
}

export type Auth = ReturnType<typeof buildAuth>;

// Public factory wraps `buildAuth` so the inferred return type stays
// internal to this module. Consumers see `Auth` (an opaque alias)
// without TS reaching into plugin internals.
export const createAuth = (env: Env): Auth => buildAuth(env);

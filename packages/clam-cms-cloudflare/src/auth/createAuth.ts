/**
 * Better Auth instance factory — Cloudflare D1 adapter wiring.
 *
 * Replaces the hand-rolled `oauth/githubOAuth.ts` flow + the
 * `OAuthVerifier` port + `D1UserRepository` / `D1SessionRepository` /
 * `D1StaffRepository` per ADR-0014.
 *
 * Consumer wiring (publication starter, future starters):
 *
 *   import { createAuth } from "@aotterclam/clam-cms-cloudflare";
 *
 *   const auth = createAuth({
 *     database: env.DB,
 *     baseURL: env.PUBLIC_ORIGIN ?? "http://localhost:8787",
 *     secret: env.BETTER_AUTH_SECRET!,
 *     github: env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
 *       ? { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET }
 *       : undefined,
 *     adminGithubLogin: env.ADMIN_GITHUB_LOGIN,
 *   });
 *
 * The auth instance is then passed to `createCmsRef` which threads it
 * to mount factories (`mountServerEndpoints`, `mountMcp`).
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, mcp } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { Kysely } from "kysely";
import { D1Dialect } from "kysely-d1";

/**
 * Closed enum of admin (staff) roles. Mirrors the existing
 * `ctx.staff: [...]` predicate vocabulary in manifest grammar.
 * Order = severity ascending (`contributor < editor < owner`).
 */
export const ADMIN_ROLES = ["contributor", "editor", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface CreateAuthConfig {
  /** D1 binding from the Worker env. Better Auth's tables live here. */
  readonly database: D1Database;
  /** Public origin used for OAuth callback URLs and cookie domain.
   *  Production: the deployed Worker URL (`https://example.workers.dev`).
   *  Dev: `http://localhost:8787`. */
  readonly baseURL: string;
  /** 32+ random bytes used to sign session tokens. Production: set
   *  via `wrangler secret put BETTER_AUTH_SECRET`. */
  readonly secret: string;
  /** GitHub OAuth App credentials. Optional; the github provider is
   *  enabled only when both fields are present. */
  readonly github?: {
    readonly clientId: string;
    readonly clientSecret: string;
  };
  /** GitHub login (handle) that auto-promotes to `owner` on first
   *  sign-in. Mirrors the legacy `ADMIN_GITHUB_LOGIN` env var. The
   *  hook is a no-op when this is undefined or empty. */
  readonly adminGithubLogin?: string;
}

// Access-control statements + per-role permission grants. The admin
// plugin requires every role listed in `adminRoles` to be defined
// here. We extend Better Auth's defaultStatements (user / session
// management) with no extra statements for v0.1.0 — manifest-level
// `requires.auth.all` predicates evaluate against `user.role` directly,
// they do not consume the access-control framework. Keep statements
// minimal to avoid a parallel permission system.
const ac = createAccessControl(defaultStatements);

const ownerAc = ac.newRole({
  user: defaultStatements.user,
  session: defaultStatements.session,
});
const editorAc = ac.newRole({
  user: ["list", "ban", "get", "update"],
  session: ["list", "revoke"],
});
const contributorAc = ac.newRole({
  user: ["list", "get"],
  session: [],
});
const userAc = ac.newRole({
  user: [],
  session: [],
});

/**
 * Build the Better Auth instance from a small platform-agnostic
 * config. Construct fresh per worker isolate (or cache the result —
 * Better Auth's instance holds plugin handles and a Kysely DB
 * reference, both safe to reuse across requests in the same isolate).
 *
 * Return type intentionally inferred. Exporting a named return type
 * triggers TS4058 — Better Auth's plugin internals (`MCPOptions`,
 * `AdminOptions`, ...) are not in the public surface, so any module
 * exposing the inferred type fails declaration emission. The caller
 * receives the full `Auth<...>` instance and uses `auth.handler` /
 * `auth.api.*`; both surfaces are stable regardless of the declared
 * type.
 */
function buildAuth(config: CreateAuthConfig) {
  // Better Auth queries through Kysely; schema is unknown at
  // typecheck time (canonical migrations own DDL out-of-band), so
  // loose typing is fine — Better Auth's internal query builder is
  // separately typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = new Kysely<any>({
    dialect: new D1Dialect({ database: config.database }),
  });

  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (config.github) {
    socialProviders.github = {
      clientId: config.github.clientId,
      clientSecret: config.github.clientSecret,
      // Better Auth's GitHub provider stores name / email / image on
      // user. We need `login` (the GH handle) for the
      // adminGithubLogin comparison; pull it via mapProfileToUser
      // into the `githubLogin` custom field below.
      mapProfileToUser: (profile) => ({
        githubLogin: profile.login,
      }),
    };
  }

  const adminGithubLogin = config.adminGithubLogin?.trim();

  return betterAuth({
    database: db,
    secret: config.secret,
    baseURL: config.baseURL,
    socialProviders,
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
        adminRoles: [...ADMIN_ROLES],
        ac,
        roles: {
          owner: ownerAc,
          editor: editorAc,
          contributor: contributorAc,
          user: userAc,
        },
      }),
      mcp({
        // Where Better Auth redirects unauthenticated MCP authorize
        // requests. Consumers render their own sign-in view here.
        loginPage: "/auth/sign-in",
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // ensureBootstrapOwner: first user matching adminGithubLogin
            // is auto-promoted to `owner` if no other admin role
            // holder exists yet. Replaces the inline logic that lived
            // in the legacy /admin/auth/github/callback handler.
            if (!adminGithubLogin) return;
            const u = user as { id: string; githubLogin?: string | null };
            if (u.githubLogin?.toLowerCase() !== adminGithubLogin.toLowerCase()) return;

            const existingAdmin = await db
              .selectFrom("user")
              .select("id")
              .where("role", "in", [...ADMIN_ROLES])
              .limit(1)
              .execute();
            if (existingAdmin.length > 0) return;

            await db
              .updateTable("user")
              .set({ role: "owner" })
              .where("id", "=", u.id)
              .execute();
          },
        },
      },
    },
  });
}

/**
 * Structural facade over the Better Auth instance.
 *
 * Better Auth's full inferred type pulls plugin internals
 * (`MCPOptions`, `AdminOptions`, ...) that aren't re-exported from
 * the public package surface, so emitting a .d.ts that names that
 * type fails (TS4058). Most consumers only need `handler` + a few
 * session helpers, so we expose those explicitly and keep the rich
 * Better Auth API behind `auth.api` accessible via the same instance
 * (cast at point of use within this package).
 */
export interface Auth {
  /** Better Auth's HTTP request handler. Mount at `/api/auth/*`. */
  readonly handler: (request: Request) => Promise<Response>;
  /** Read the current cookie session from a request. Returns null
   *  when no valid session cookie is present. */
  readonly getSession: (request: Request) => Promise<{
    session: { id: string; userId: string; expiresAt: Date };
    user: {
      id: string;
      email: string;
      name: string;
      image?: string | null;
      role?: string | null;
      githubLogin?: string | null;
    };
  } | null>;
  /** Read the MCP bearer-token session from a request. Returns null
   *  for missing / invalid / expired tokens. */
  readonly getMcpSession: (request: Request) => Promise<{
    userId: string;
    scopes: string[];
    clientId: string;
  } | null>;
  /**
   * Escape hatch for code inside this package that needs the rich
   * Better Auth API (admin actions, OIDC consent, ...). Internal use
   * only — consumers should stick to the explicit methods above.
   *
   * @internal
   */
  readonly _raw: unknown;
}

/** Construct the Better Auth instance. */
export function createAuth(config: CreateAuthConfig): Auth {
  const auth = buildAuth(config);
  return {
    handler: (request) => auth.handler(request),
    getSession: async (request) => {
      const result = await auth.api.getSession({ headers: request.headers });
      return (result ?? null) as Auth["getSession"] extends (...a: never[]) => Promise<infer R> ? R : never;
    },
    getMcpSession: async (request) => {
      // The mcp plugin exposes `getMcpSession` on auth.api when loaded.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = auth.api as any;
      if (typeof api.getMcpSession !== "function") return null;
      const result = await api.getMcpSession({ headers: request.headers });
      return result ?? null;
    },
    _raw: auth,
  };
}

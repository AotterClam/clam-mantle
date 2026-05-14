import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, mcp } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ADMIN_ROLES = ["contributor", "editor", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

/**
 * Auth method configurations. Discriminated union — adding a new
 * method (email-otp, magic-link, google, passkey, ...) becomes a new
 * union case in this file, not a new top-level key on
 * `CreateAuthConfig`. Order of registration in `methods[]` controls
 * the display order on the admin sign-in page (when admin-ui renders
 * data-driven, see issue #159).
 *
 * Per ADR-0014 we expect GitHub / Google / Apple via Better Auth's
 * `socialProviders`, plus email OTP and magic link via plugins.
 * This shape lets every method ride one slot.
 */
export type AuthMethodConfig =
  | {
      readonly kind: "github";
      readonly clientId: string;
      readonly clientSecret: string;
      /** Override the OAuth callback URL Better Auth tells GitHub to
       *  redirect to. The consumer is then responsible for forwarding
       *  requests at that URI to `auth.handler`. */
      readonly redirectURI?: string;
    };

/**
 * First-staff promotion rule. The `databaseHooks.user.create.after`
 * hook checks each created user against this rule; the first matching
 * user with no existing admin in the DB is promoted to `owner`.
 *
 * Decoupled from the method config — switching the bootstrap rule
 * (e.g. from `github-login` to `email`) doesn't require touching any
 * method's options.
 */
export type BootstrapOwnerRule =
  | { readonly match: "github-login"; readonly value: string }
  | { readonly match: "email"; readonly value: string };

export interface CreateAuthConfig {
  readonly database: D1Database;
  readonly baseURL: string;
  readonly secret: string;
  /**
   * Registered auth methods. Display order on the admin sign-in page
   * follows this array. Boot fails fast if empty — every consumer
   * needs at least one way for staff to sign in.
   */
  readonly methods: ReadonlyArray<AuthMethodConfig>;
  /** First-user-becomes-owner rule. Optional; without it, owner role
   *  must be assigned manually in D1. */
  readonly bootstrapOwner?: BootstrapOwnerRule;
  /** Better Auth's built-in rate limit. Applies to every method's
   *  endpoints. Defaults off; production deployments should set it. */
  readonly rateLimit?: { readonly window: number; readonly max: number };
}

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

function buildSocialProviders(
  methods: ReadonlyArray<AuthMethodConfig>,
): BetterAuthOptions["socialProviders"] {
  const out: BetterAuthOptions["socialProviders"] = {};
  for (const method of methods) {
    if (method.kind === "github") {
      out.github = {
        clientId: method.clientId,
        clientSecret: method.clientSecret,
        mapProfileToUser: (profile) => ({
          githubLogin: profile.login,
        }),
        ...(method.redirectURI ? { redirectURI: method.redirectURI } : {}),
      };
    }
  }
  return out;
}

function shouldPromoteToOwner(
  rule: BootstrapOwnerRule,
  user: { readonly email?: string | null; readonly githubLogin?: string | null },
): boolean {
  switch (rule.match) {
    case "github-login":
      return (
        !!user.githubLogin &&
        user.githubLogin.toLowerCase() === rule.value.trim().toLowerCase()
      );
    case "email":
      return !!user.email && user.email.toLowerCase() === rule.value.trim().toLowerCase();
  }
}

function buildAuth(config: CreateAuthConfig) {
  if (config.methods.length === 0) {
    throw new Error(
      "createAuth: methods[] is empty — register at least one AuthMethodConfig so staff can sign in.",
    );
  }
  const socialProviders = buildSocialProviders(config.methods);
  const bootstrap = config.bootstrapOwner;

  return betterAuth({
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    socialProviders,
    user: {
      additionalFields: {
        githubLogin: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    ...(config.rateLimit ? { rateLimit: { ...config.rateLimit, enabled: true } } : {}),
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
        loginPage: "/admin/sign-in",
        oidcConfig: {
          loginPage: "/admin/sign-in",
          scopes: ["mcp:read", "mcp:staff"],
          defaultScope: "openid profile email mcp:read",
          metadata: {
            scopes_supported: [
              "openid",
              "profile",
              "email",
              "offline_access",
              "mcp:read",
              "mcp:staff",
            ],
          },
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            if (!bootstrap) return;
            const u = user as {
              id: string;
              email?: string | null;
              githubLogin?: string | null;
            };
            if (!shouldPromoteToOwner(bootstrap, u)) return;

            const placeholders = ADMIN_ROLES.map(() => "?").join(",");
            const existingAdmin = await config.database
              .prepare(`SELECT id FROM user WHERE role IN (${placeholders}) LIMIT 1`)
              .bind(...ADMIN_ROLES)
              .first<{ id: string }>();
            if (existingAdmin) return;

            await config.database
              .prepare("UPDATE user SET role = ? WHERE id = ?")
              .bind("owner", u.id)
              .run();
          },
        },
      },
    },
  });
}

// Better Auth's full inferred type pulls plugin internals
// (`MCPOptions`, `AdminOptions`) that aren't re-exported, so emitting
// a .d.ts that names that type fails (TS4058). The structural facade
// keeps the public surface stable.
export interface Auth {
  readonly handler: (request: Request) => Promise<Response>;
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
  readonly getMcpSession: (request: Request) => Promise<{
    userId: string;
    scopes: string[];
    clientId: string;
  } | null>;
  /** Read `user.role` directly from D1. Bearer-token auth surfaces
   *  (MCP, HTTP Triggers) need this because Better Auth's MCP access
   *  tokens carry userId + scopes but not the user's role. */
  readonly getUserRole: (userId: string) => Promise<string | null>;
}

export function createAuth(config: CreateAuthConfig): Auth {
  const auth = buildAuth(config);
  // The mcp plugin is always loaded by buildAuth, so getMcpSession is
  // guaranteed present. Bind once at construction.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = auth.api as any;
  return {
    handler: (request) => auth.handler(request),
    getSession: (request) =>
      api.getSession({ headers: request.headers }).then((r: unknown) => r ?? null),
    getMcpSession: async (request) => {
      const r = await api.getMcpSession({ headers: request.headers });
      if (!r) return null;
      const raw = r as { userId: string; scopes: string[] | string; clientId: string };
      return {
        ...raw,
        scopes: Array.isArray(raw.scopes)
          ? raw.scopes
          : raw.scopes.split(/\s+/).filter(Boolean),
      };
    },
    getUserRole: async (userId) => {
      const row = await config.database
        .prepare("SELECT role FROM user WHERE id = ? LIMIT 1")
        .bind(userId)
        .first<{ role: string | null }>();
      return row?.role ?? null;
    },
  };
}

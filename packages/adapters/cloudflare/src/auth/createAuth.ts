import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, mcp } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ADMIN_ROLES = ["contributor", "editor", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

/**
 * Auth method config (discriminated union). Adding a new method
 * (email-otp, google, passkey, ...) becomes a new case here, not a
 * new top-level key on `CreateAuthConfig` — per ADR-0014.
 *
 * Written as a one-member union (leading `|`) deliberately — keeps
 * the switch in `buildSocialProviders` exhaustiveness-checked when
 * PR-B adds a second variant; a flat object type would silently
 * accept the new shape without firing the never-narrowing.
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
 * First-staff promotion rule. Decoupled from `methods[]` so switching
 * the bootstrap signal (e.g. `github-login` → `email`) doesn't touch
 * any method's options.
 */
export type BootstrapOwnerRule =
  | { readonly match: "github-login"; readonly value: string }
  | { readonly match: "email"; readonly value: string };

export interface CreateAuthConfig {
  readonly database: D1Database;
  readonly baseURL: string;
  readonly secret: string;
  /** Registered auth methods. Boot fails fast if empty. */
  readonly methods: ReadonlyArray<AuthMethodConfig>;
  /** First-user-becomes-owner rule. Without it, the `owner` role must
   *  be assigned manually in D1. */
  readonly bootstrapOwner?: BootstrapOwnerRule;
  /** Better Auth's built-in rate limit. Defaults off; production
   *  deployments should set it. */
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
    switch (method.kind) {
      case "github":
        out.github = {
          clientId: method.clientId,
          clientSecret: method.clientSecret,
          mapProfileToUser: (profile) => ({
            githubLogin: profile.login,
          }),
          ...(method.redirectURI ? { redirectURI: method.redirectURI } : {}),
        };
        break;
      default: {
        // Runtime guard for unknown `kind` values. The compile-time
        // exhaustiveness check activates the moment PR-B adds a
        // second union variant — until then there's nothing for
        // TypeScript to narrow into `never`.
        const kind = (method as { kind: string }).kind;
        throw new Error(`createAuth: unhandled AuthMethodConfig.kind '${kind}'`);
      }
    }
  }
  return out;
}

/**
 * Cross-check bootstrap rule against registered methods. Catches the
 * silent-no-op case where the rule's discriminator can never match
 * any signal a registered method actually produces — e.g.
 * `match: "github-login"` with no `github` method registered. Throws
 * at construction so vibe-coders see the mistake before the first
 * sign-in attempt.
 */
function validateBootstrap(
  rule: BootstrapOwnerRule,
  methods: ReadonlyArray<AuthMethodConfig>,
): void {
  if (rule.match === "github-login") {
    const hasGithub = methods.some((m) => m.kind === "github");
    if (!hasGithub) {
      throw new Error(
        "createAuth: bootstrapOwner.match='github-login' but no `github` method is registered. " +
          "Either register a github method or switch to `bootstrapOwner: { match: 'email', value: '…' }`.",
      );
    }
  }
  // `match: "email"` is permissive — every Better Auth method that
  // creates a user populates `email`, including GitHub (via the
  // upstream profile). No registration constraint to enforce.
}

function shouldPromoteToOwner(
  rule: BootstrapOwnerRule,
  user: { readonly email?: string | null; readonly githubLogin?: string | null },
): boolean {
  const target = rule.value.trim().toLowerCase();
  switch (rule.match) {
    case "github-login":
      return !!user.githubLogin && user.githubLogin.toLowerCase() === target;
    case "email":
      return !!user.email && user.email.toLowerCase() === target;
  }
}

function buildAuth(config: CreateAuthConfig) {
  if (config.methods.length === 0) {
    throw new Error(
      "createAuth: methods[] is empty — register at least one AuthMethodConfig so staff can sign in.",
    );
  }
  if (config.bootstrapOwner) {
    validateBootstrap(config.bootstrapOwner, config.methods);
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

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, mcp } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";

export const ADMIN_ROLES = ["contributor", "editor", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

export interface CreateAuthConfig {
  readonly database: D1Database;
  readonly baseURL: string;
  readonly secret: string;
  readonly github?: {
    readonly clientId: string;
    readonly clientSecret: string;
    /** Override the OAuth callback URL Better Auth tells GitHub to
     *  redirect to. The consumer is then responsible for forwarding
     *  requests at that URI to `auth.handler`. */
    readonly redirectURI?: string;
  };
  readonly adminGithubLogin?: string;
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

function buildAuth(config: CreateAuthConfig) {
  const socialProviders: BetterAuthOptions["socialProviders"] = {};
  if (config.github) {
    socialProviders.github = {
      clientId: config.github.clientId,
      clientSecret: config.github.clientSecret,
      mapProfileToUser: (profile) => ({
        githubLogin: profile.login,
      }),
      ...(config.github.redirectURI
        ? { redirectURI: config.github.redirectURI }
        : {}),
    };
  }

  const adminGithubLogin = config.adminGithubLogin?.trim();

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
            if (!adminGithubLogin) return;
            const u = user as { id: string; githubLogin?: string | null };
            if (u.githubLogin?.toLowerCase() !== adminGithubLogin.toLowerCase()) return;

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

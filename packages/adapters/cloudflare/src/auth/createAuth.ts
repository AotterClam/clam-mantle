import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, emailOTP, magicLink, mcp } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { EmailSender } from "@aotter/mantle-runtime";

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
    }
  | {
      readonly kind: "email-otp";
      /** Transactional-email sender. SDK never owns body templates;
       *  the locale is passed through so the sender can branch. */
      readonly sender: EmailSender;
      /** OTP length (Better Auth default 6). */
      readonly otpLength?: number;
      /** OTP TTL in seconds (Better Auth default 300 = 5 min). */
      readonly expiresInSeconds?: number;
      /** Allowed attempts before the OTP locks (Better Auth default 3). */
      readonly allowedAttempts?: number;
      /** Fallback locale when the request carries no Accept-Language —
       *  typically the site's canonical locale. BCP 47. Defaults to "en". */
      readonly fallbackLocale?: string;
    }
  | {
      readonly kind: "magic-link";
      /** Transactional-email sender. The email body carries a single
       *  clickable URL; Better Auth verifies the token when the user
       *  lands on it. */
      readonly sender: EmailSender;
      /** Link TTL in seconds. Defaults to 900 (15 min); see
       *  `MAGIC_LINK_DEFAULT_EXPIRES_SECONDS` for rationale. */
      readonly expiresInSeconds?: number;
      /** Allowed verification attempts. Defaults to 3 to survive
       *  mail-prefetcher URL scans (Outlook Safe Links etc.); see
       *  `MAGIC_LINK_DEFAULT_ALLOWED_ATTEMPTS`. */
      readonly allowedAttempts?: number;
      /** Fallback locale when the request carries no Accept-Language. */
      readonly fallbackLocale?: string;
    };

/**
 * First-staff promotion rule. Decoupled from `methods[]` so switching
 * the bootstrap signal (e.g. `github-login` → `email`) doesn't touch
 * any method's options.
 *
 * Promotion fires on `user.create.after`, which Better Auth dispatches
 * **only on first user creation**. If the operator signs in via one
 * method (say GitHub) before the rule can match (say `match: "email"`
 * with a non-GitHub email), the user row is created and a later
 * sign-in via a different method on the SAME email reuses that row —
 * `create.after` does not re-fire and the owner role is never
 * assigned. Match key first; the linked second method inherits the
 * role via the shared `user.id`.
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

/**
 * First tag off `Accept-Language`, quality values ignored. Locale
 * contract lives in `EmailSender.ts`.
 */
function pickLocale(req: Request | undefined, fallback: string): string {
  const header = req?.headers.get("accept-language");
  if (!header) return fallback;
  const first = header.split(",")[0]?.split(";")[0]?.trim();
  return first && first.length > 0 ? first : fallback;
}

// Magic-link defaults override Better Auth's tighter built-ins:
//   - 900s (15 min) link TTL — corporate mail (Outlook + Exchange,
//     Mimecast, Proofpoint URL Defense) often has 30-60s delivery
//     lag and users batch-check; 300s shipped too many "expired"
//     receipts. Industry baseline: Slack 60min, Notion / Vercel
//     24h. We split the difference and let adopters override.
//   - 3 allowed verification attempts — mail prefetchers (Outlook
//     Safe Links, Mimecast URL Protect, Proofpoint URL Defense)
//     routinely consume URLs once before the user opens the email.
//     1 attempt is genuinely broken on those inboxes.
const MAGIC_LINK_DEFAULT_EXPIRES_SECONDS = 900;
const MAGIC_LINK_DEFAULT_ALLOWED_ATTEMPTS = 3;

function buildMagicLinkPlugin(method: Extract<AuthMethodConfig, { kind: "magic-link" }>) {
  const fallback = method.fallbackLocale ?? "en";
  return magicLink({
    expiresIn: method.expiresInSeconds ?? MAGIC_LINK_DEFAULT_EXPIRES_SECONDS,
    allowedAttempts: method.allowedAttempts ?? MAGIC_LINK_DEFAULT_ALLOWED_ATTEMPTS,
    // Returned synchronously — same fire-and-forget contract as
    // email-otp via `advanced.backgroundTasks.handler`. The body
    // carries the click-URL; SDK doesn't ship a template, the
    // sender can render plain text or richer HTML.
    sendMagicLink: (data, ctx) => {
      const locale = pickLocale(ctx?.request, fallback);
      return method.sender.send({
        to: data.email,
        subject: "Your sign-in link",
        text: `Click to sign in: ${data.url}\nThe link expires shortly. If you didn't request this, ignore this email.`,
        locale,
        category: "auth.magic-link.sign-in",
      });
    },
  });
}

function buildEmailOTPPlugin(method: Extract<AuthMethodConfig, { kind: "email-otp" }>) {
  const fallback = method.fallbackLocale ?? "en";
  return emailOTP({
    ...(method.otpLength !== undefined ? { otpLength: method.otpLength } : {}),
    ...(method.expiresInSeconds !== undefined
      ? { expiresIn: method.expiresInSeconds }
      : {}),
    ...(method.allowedAttempts !== undefined
      ? { allowedAttempts: method.allowedAttempts }
      : {}),
    // Return synchronously — the promise is fire-and-forget via the
    // `advanced.backgroundTasks.handler` we wire in `buildAuth`. For
    // `email-verification` / `forget-password` types Better Auth only
    // calls this when the user exists, so awaiting would leak account
    // existence through response latency. See Better Auth's own
    // sendVerificationOTP docstring + reviewer finding in PR #161.
    sendVerificationOTP: (data, ctx) => {
      const locale = pickLocale(ctx?.request, fallback);
      return method.sender.send({
        to: data.email,
        subject: `Your sign-in code: ${data.otp}`,
        text: `Your one-time code is ${data.otp}. It expires shortly. If you didn't request this, ignore this email.`,
        locale,
        category: `auth.email-otp.${data.type}`,
      });
    },
  });
}

/**
 * Cross-check bootstrap rule against registered methods. Catches the
 * silent-no-op case where the rule's discriminator can never match
 * any signal a registered method actually produces — e.g.
 * `match: "github-login"` with no `github` method registered. Throws
 * at construction so vibe-coders see the mistake before the first
 * sign-in attempt.
 *
 * `match: "email"` is permissive — every Better Auth method that
 * creates a user populates `email`, including GitHub (via the
 * upstream profile). No registration constraint to enforce.
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

/**
 * Find the at-most-one method of `kind`. Throws when adopters register
 * the same kind twice — Better Auth's plugin layer accepts duplicates
 * silently, which would mask the intent at boot. One helper covers
 * every singleton-shaped method (email-otp, magic-link, future ones).
 */
function pickSingleton<K extends AuthMethodConfig["kind"]>(
  methods: ReadonlyArray<AuthMethodConfig>,
  kind: K,
): Extract<AuthMethodConfig, { kind: K }> | undefined {
  const matches = methods.filter(
    (m): m is Extract<AuthMethodConfig, { kind: K }> => m.kind === kind,
  );
  if (matches.length > 1) {
    throw new Error(
      `createAuth: more than one \`${kind}\` method registered. Combine into one.`,
    );
  }
  return matches[0];
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
  const emailOtpMethod = pickSingleton(config.methods, "email-otp");
  const magicLinkMethod = pickSingleton(config.methods, "magic-link");

  // Rate limit: Better Auth's per-route limits gate on
  // `process.env.NODE_ENV === "production"`, which is unset on
  // Cloudflare Workers — leaving the limits silently off. When any
  // email-shaped method is wired (free email-send-to-any-address
  // surface) we ALWAYS turn limits on; adopter can override
  // window/max via `config.rateLimit`.
  const hasEmailMethod = !!(emailOtpMethod || magicLinkMethod);
  const rateLimitDefault = hasEmailMethod
    ? { window: 60, max: 10, enabled: true as const }
    : null;
  const rateLimit = config.rateLimit
    ? { ...config.rateLimit, enabled: true as const }
    : rateLimitDefault;

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
    ...(rateLimit ? { rateLimit } : {}),
    // Fire-and-forget for any callback that opts into background.
    // Better Auth's emailOTP plugin wraps `sendVerificationOTP` in
    // `runInBackgroundOrAwait` — without this hook it awaits, which
    // turns response latency into a user-existence oracle (Better
    // Auth only calls the callback when the user exists for
    // `email-verification` / `forget-password` types). With this
    // hook the callback returns immediately. We don't have request-
    // scoped `ctx.waitUntil` at this construction-time layer, so
    // pending sends rely on the Worker isolate staying alive long
    // enough — typical for ~100-500ms sends. A waitUntil-aware
    // version is queued as a follow-up; until then fire-and-forget
    // beats the timing leak.
    advanced: {
      backgroundTasks: {
        handler: (p) => {
          p.catch((err) => {
            // eslint-disable-next-line no-console
            console.error("[better-auth backgroundTask]", err);
          });
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
      ...(emailOtpMethod ? [buildEmailOTPPlugin(emailOtpMethod)] : []),
      ...(magicLinkMethod ? [buildMagicLinkPlugin(magicLinkMethod)] : []),
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

/**
 * Method kind exposed to clients. Mirrors `AuthMethodConfig["kind"]`
 * but without the adapter-internal config (secrets, sender refs). The
 * admin SPA reads this to decide which sign-in sections to render.
 */
export type AuthMethodKind = AuthMethodConfig["kind"];

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
  /** Method kinds the consumer registered, in declaration order. The
   *  admin SPA renders sign-in sections per this list. Secrets and
   *  sender refs are intentionally excluded — UI doesn't need them. */
  readonly methods: ReadonlyArray<AuthMethodKind>;
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
    methods: config.methods.map((m) => m.kind),
  };
}

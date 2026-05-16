import { betterAuth, type BetterAuthOptions } from "better-auth";
import { admin, emailOTP, magicLink } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import type { EmailSender } from "@aotterclam/mantle-runtime";

export const ADMIN_ROLES = ["contributor", "editor", "owner"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

/**
 * Provider id for the `kind: "social"` method. Mirrors Better Auth's
 * own `socialProviders` block keys for 1.6.9. Adding a provider that
 * Better Auth supports = adding its id here; no other wiring needed
 * (the config flows through to Better Auth as-is, plus the per-
 * provider i18n label).
 */
export type SocialProviderId =
  | "github"
  | "google"
  | "apple"
  | "microsoft-entra-id"
  | "facebook"
  | "discord"
  | "twitter"
  | "linkedin"
  | "spotify"
  | "twitch"
  | "gitlab"
  | "tiktok"
  | "reddit"
  | "kick"
  | "vk"
  | "naver"
  | "kakao"
  | "line"
  | "slack"
  | "atlassian"
  | "zoom"
  | "notion"
  | "figma"
  | "linear"
  | "vercel"
  | "paypal"
  | "huggingface"
  | "cognito"
  | "salesforce"
  | "polar"
  | "railway"
  | "roblox"
  | "paybin"
  | "wechat"
  | "dropbox";

/**
 * Auth method config (discriminated union). Each `kind` is one auth
 * surface adopters can opt into; adding a new method = adding a new
 * union case here, not a new top-level key on `CreateAuthConfig` —
 * per ADR-0014.
 *
 * `kind: "social"` is the OAuth-based bucket — `provider` discriminates
 * the upstream IDP. We use one case rather than one-per-provider so
 * adding (e.g.) Apple doesn't churn the union; Better Auth's
 * provider-shaped quirks ride in `extras`.
 */
export type AuthMethodConfig =
  | {
      readonly kind: "social";
      readonly provider: SocialProviderId;
      readonly clientId: string;
      readonly clientSecret: string;
      /** Override the OAuth callback URL Better Auth tells the IDP to
       *  redirect to. The consumer is then responsible for forwarding
       *  requests at that URI to `auth.handler`. */
      readonly redirectURI?: string;
      /** OAuth scopes. Defaults vary per provider; only set when the
       *  default doesn't cover what you need (e.g. extra Google
       *  scopes for a Drive integration). */
      readonly scope?: ReadonlyArray<string>;
      /** Escape hatch for provider-specific options Better Auth
       *  accepts but we don't surface as first-class fields —
       *  Microsoft Entra ID's `tenantId`, Reddit's `duration`,
       *  per-provider `prompt` / `accessType` knobs, etc. Merged
       *  into the provider's config verbatim.
       *
       *  Reserved keys are rejected at construction so a stray entry
       *  can't silently shadow first-class config: `clientId`,
       *  `clientSecret`, `redirectURI`, `scope`, `mapProfileToUser`.
       *  Use the first-class fields for those.
       *
       *  Note: Apple specifically does NOT accept teamId/keyId/
       *  privateKey via Better Auth — its `clientSecret` is the
       *  pre-signed ES256 JWT the adopter generates out-of-band. */
      readonly extras?: Readonly<Record<string, unknown>>;
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
 *
 * `match: "github-login"` is also brittle when multiple social
 * methods are registered. Only the `github` provider's
 * `mapProfileToUser` shim populates `user.githubLogin`; if the
 * operator's first sign-in is via Google or another non-GitHub
 * social, `githubLogin` is null and the rule silently no-ops. For
 * mixed-social setups prefer `match: "email"`.
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

/**
 * Keys that `extras` MUST NOT contain — they have first-class fields
 * on `AuthMethodConfig` and / or are managed by this adapter (the
 * github `mapProfileToUser` shim). Allowing them through would let a
 * stray entry shadow credentials or break bootstrap promotion.
 */
const SOCIAL_EXTRAS_RESERVED_KEYS: ReadonlySet<string> = new Set([
  "clientId",
  "clientSecret",
  "redirectURI",
  "scope",
  "mapProfileToUser",
]);

/** @internal exported for unit tests; not part of the public API. */
export function buildSocialProviders(
  methods: ReadonlyArray<AuthMethodConfig>,
): BetterAuthOptions["socialProviders"] {
  // Better Auth's typed `socialProviders` shape names every provider
  // key individually; assigning by computed string requires an index
  // signature, so we build through a plain map and cast once at the
  // return. The runtime shape matches Better Auth's expectations.
  const out: Record<string, Record<string, unknown>> = {};
  for (const method of methods) {
    if (method.kind !== "social") continue;
    if (method.extras) {
      for (const key of Object.keys(method.extras)) {
        if (SOCIAL_EXTRAS_RESERVED_KEYS.has(key)) {
          throw new Error(
            `createAuth: social method '${method.provider}' has reserved key '${key}' in \`extras\`. ` +
              `Use the first-class field instead — \`extras\` is for provider-specific options only.`,
          );
        }
      }
    }
    // GitHub-specific: stash the github login on `user.githubLogin`
    // so `bootstrapOwner: { match: "github-login" }` keeps working.
    // Other providers don't need an analogous shim because bootstrap
    // matches on email for them.
    const githubProfileMapper =
      method.provider === "github"
        ? {
            mapProfileToUser: (profile: { login?: string }) => ({
              githubLogin: profile.login,
            }),
          }
        : {};
    out[method.provider] = {
      clientId: method.clientId,
      clientSecret: method.clientSecret,
      ...(method.redirectURI ? { redirectURI: method.redirectURI } : {}),
      ...(method.scope ? { scope: [...method.scope] } : {}),
      ...(method.extras ?? {}),
      ...githubProfileMapper,
    };
  }
  return out as BetterAuthOptions["socialProviders"];
}

/**
 * First tag off `Accept-Language`, quality values ignored. Locale
 * contract lives in `EmailSender.ts`.
 */
/** @internal exported for unit tests; not part of the public API. */
export function pickLocale(req: Request | undefined, fallback: string): string {
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
/** @internal exported for unit tests; not part of the public API. */
export function validateBootstrap(
  rule: BootstrapOwnerRule,
  methods: ReadonlyArray<AuthMethodConfig>,
): void {
  if (rule.match === "github-login") {
    const hasGithub = methods.some(
      (m) => m.kind === "social" && m.provider === "github",
    );
    if (!hasGithub) {
      throw new Error(
        "createAuth: bootstrapOwner.match='github-login' but no `social` method with provider='github' is registered. " +
          "Either register a github social method or switch to `bootstrapOwner: { match: 'email', value: '…' }`.",
      );
    }
  }
}

/** @internal exported for unit tests; not part of the public API. */
export function shouldPromoteToOwner(
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

/**
 * Origins each registered social provider needs in
 * `trustedOrigins`. Adding a provider that demands an extra
 * `trustedOrigins` entry = adding a row here. Apple is the only one
 * in 1.6.9 that hard-requires this; if Better Auth ever drops the
 * requirement, the entry stays harmless (Better Auth dedupes).
 */
const SOCIAL_PROVIDER_TRUSTED_ORIGINS: Readonly<
  Partial<Record<SocialProviderId, ReadonlyArray<string>>>
> = {
  apple: ["https://appleid.apple.com"],
};

function autoTrustedOriginsFor(
  methods: ReadonlyArray<AuthMethodConfig>,
): string[] {
  const origins = methods.flatMap((m) =>
    m.kind === "social" ? SOCIAL_PROVIDER_TRUSTED_ORIGINS[m.provider] ?? [] : [],
  );
  return [...new Set(origins)];
}

/**
 * Apple uses `response_mode=form_post` — Apple POSTs cross-site to
 * our callback. The OAuth state cookie must have `sameSite: "none"`
 * (and `secure: true`, which browsers require alongside) or the
 * cookie won't ride the POST and Better Auth raises a state mismatch.
 * Other providers don't need this. We only auto-set when Apple is
 * registered AND the adopter hasn't already specified
 * `defaultCookieAttributes.sameSite` themselves.
 */
function methodsRequireSameSiteNone(
  methods: ReadonlyArray<AuthMethodConfig>,
): boolean {
  return methods.some((m) => m.kind === "social" && m.provider === "apple");
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

  // `trustedOrigins`: per-provider auto-origins (Apple needs
  // `https://appleid.apple.com`). No adopter override — Better Auth
  // configuration is fully owned by the SDK (no escape hatch).
  const trustedOrigins = autoTrustedOriginsFor(config.methods);

  const sdkPlugins = [
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
    ...(emailOtpMethod ? [buildEmailOTPPlugin(emailOtpMethod)] : []),
    ...(magicLinkMethod ? [buildMagicLinkPlugin(magicLinkMethod)] : []),
  ];

  // `user.additionalFields`: SDK owns `githubLogin` only.
  const userConfig = {
    additionalFields: {
      githubLogin: {
        type: "string" as const,
        required: false,
        input: false,
      },
    },
  };

  // `advanced`: SDK owns `backgroundTasks`. Apple auto-injects
  // `defaultCookieAttributes.sameSite: "none"` because Apple's
  // `form_post` callback is cross-site and a `lax` cookie won't ride
  // it (Better Auth's default raises a state-mismatch).
  const appleNeedsCrossSite = methodsRequireSameSiteNone(config.methods);
  const advancedConfig = {
    ...(appleNeedsCrossSite
      ? {
          // Browsers require `secure: true` whenever `sameSite: "none"`.
          defaultCookieAttributes: { secure: true, sameSite: "none" as const },
        }
      : {}),
    // Fire-and-forget hook closes the user-existence timing oracle
    // on OTP send — see § "Auth as contract" notes in ADR-0014.
    backgroundTasks: {
      handler: (p: Promise<unknown>) => {
        p.catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[better-auth backgroundTask]", err);
        });
      },
    },
  };

  // `databaseHooks`: SDK owns `user.create.after` for bootstrap-owner
  // promotion (when `bootstrapOwner` is configured).
  const sdkUserCreateAfter = async (user: unknown): Promise<void> => {
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
  };
  const databaseHooks = {
    user: {
      create: { after: sdkUserCreateAfter },
    },
  };

  return betterAuth({
    database: config.database,
    secret: config.secret,
    baseURL: config.baseURL,
    socialProviders,
    user: userConfig,
    ...(rateLimit ? { rateLimit } : {}),
    trustedOrigins,
    advanced: advancedConfig,
    plugins: sdkPlugins,
    databaseHooks,
  });
}

/**
 * Method kind exposed to clients. Mirrors `AuthMethodConfig["kind"]`
 * but without the adapter-internal config (secrets, sender refs). The
 * admin SPA reads this to decide which sign-in sections to render.
 */
export type AuthMethodKind = AuthMethodConfig["kind"];

/**
 * Public-facing method descriptor exposed via `Auth.methods` and the
 * `GET /api/auth/methods` endpoint. The `social` kind carries the
 * upstream `provider` so the admin SPA can render a per-provider
 * button (label + future brand icon). Secrets, senders, and per-
 * provider extras stay private.
 */
export type AuthMethodInfo =
  | { readonly kind: "email-otp" }
  | { readonly kind: "magic-link" }
  | { readonly kind: "social"; readonly provider: SocialProviderId };

// Better Auth's full inferred type pulls plugin internals
// (`AdminOptions`) that aren't re-exported, so emitting a .d.ts that
// names that type fails (TS4058). The structural facade keeps the
// public surface stable.
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
  /** Read `user.role` directly from D1. Bearer-token auth surfaces
   *  (MCP, HTTP Triggers) need this because OAuth access tokens carry
   *  userId + scopes but not the user's role. */
  readonly getUserRole: (userId: string) => Promise<string | null>;
  /** Methods the consumer registered, in declaration order. The admin
   *  SPA renders sign-in sections per this list. Secrets, senders, and
   *  per-provider extras are intentionally excluded — UI doesn't need
   *  them. `social` methods carry the upstream `provider` id for
   *  per-provider rendering. */
  readonly methods: ReadonlyArray<AuthMethodInfo>;
}

export function createAuth(config: CreateAuthConfig): Auth {
  const auth = buildAuth(config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = auth.api as any;
  return {
    handler: (request) => auth.handler(request),
    getSession: (request) =>
      api.getSession({ headers: request.headers }).then((r: unknown) => r ?? null),
    getUserRole: async (userId) => {
      const row = await config.database
        .prepare("SELECT role FROM user WHERE id = ? LIMIT 1")
        .bind(userId)
        .first<{ role: string | null }>();
      return row?.role ?? null;
    },
    methods: config.methods.map<AuthMethodInfo>((m) =>
      m.kind === "social"
        ? { kind: "social", provider: m.provider }
        : { kind: m.kind },
    ),
  };
}

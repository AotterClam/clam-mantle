import { describe, expect, it } from "vitest";
import type { EmailSender } from "@aotter/mantle-runtime";
import {
  buildSocialProviders,
  createAuth,
  pickLocale,
  shouldPromoteToOwner,
  validateBootstrap,
  type AuthMethodConfig,
  type BootstrapOwnerRule,
  type CreateAuthConfig,
} from "../src/auth/createAuth.js";

/**
 * Unit tests for `createAuth`. Covers the pure helpers (pickLocale,
 * validateBootstrap, shouldPromoteToOwner, buildSocialProviders) and
 * the construction-time invariants `createAuth` enforces (empty
 * methods, bootstrap mismatch, singleton-per-method, reserved-keys
 * in social.extras).
 *
 * End-to-end Better Auth flows (sign-in / sign-up / session creation
 * / cookie issuance) need a real HTTP harness against D1 and are not
 * covered here — those land in a future integration smoke.
 */

const NULL_SENDER: EmailSender = {
  send: async () => {
    // no-op for tests
  },
};

const GITHUB_METHOD_FIXTURE = {
  kind: "social",
  provider: "github",
  clientId: "g",
  clientSecret: "g",
} as const satisfies AuthMethodConfig;

/**
 * `buildSocialProviders` returns `BetterAuthOptions["socialProviders"]`
 * — a union of per-provider option types under named keys. Tests assert
 * against arbitrary keys, so cast once at the boundary.
 */
function asProviderMap(
  out: ReturnType<typeof buildSocialProviders>,
): Record<string, Record<string, unknown>> {
  return out as unknown as Record<string, Record<string, unknown>>;
}

function fakeDb(): D1Database {
  // Better Auth probes the D1 binding during construction (its kysely
  // wrapper calls `.prepare(sql).bind(...).all()` to introspect). A
  // bare `{}` raises `BetterAuthError: Failed to initialize database
  // adapter` as an unhandled rejection. Tests that actually exercise
  // queries are out of scope here (would need miniflare).
  const stmt = {
    bind: () => stmt,
    all: async () => ({ results: [], success: true, meta: {} }),
  };
  return {
    prepare: () => stmt,
    exec: async () => ({ count: 0, duration: 0 }),
    batch: async () => [],
  } as unknown as D1Database;
}

function baseConfig(
  overrides: Partial<CreateAuthConfig> = {},
): CreateAuthConfig {
  return {
    database: fakeDb(),
    baseURL: "https://example.test",
    secret: "x".repeat(40),
    methods: [GITHUB_METHOD_FIXTURE],
    ...overrides,
  };
}

describe("pickLocale", () => {
  function req(headerValue: string | undefined): Request | undefined {
    if (headerValue === undefined) return undefined;
    return new Request("https://example.test/", {
      headers: { "accept-language": headerValue },
    });
  }

  it("returns fallback when request is undefined", () => {
    expect(pickLocale(undefined, "en")).toBe("en");
  });

  it("returns fallback when accept-language is missing", () => {
    expect(
      pickLocale(new Request("https://example.test/"), "ja"),
    ).toBe("ja");
  });

  it("returns the first tag with q-values stripped", () => {
    expect(
      pickLocale(req("en-US,en;q=0.9,zh-TW;q=0.8"), "en"),
    ).toBe("en-US");
  });

  it("trims surrounding whitespace", () => {
    expect(pickLocale(req("  fr-FR  "), "en")).toBe("fr-FR");
  });

  it("returns fallback when the first tag is empty after splitting", () => {
    // A header that's literally a leading comma — first split is ""
    expect(pickLocale(req(","), "en")).toBe("en");
  });

  it("does not interpret '*' specially — returns it as-is", () => {
    // '*' is the wildcard, but the v0.1 picker doesn't try to resolve
    // it. The receiving sender / template decides what to do.
    expect(pickLocale(req("*"), "en")).toBe("*");
  });
});

describe("validateBootstrap", () => {
  it("accepts match='github-login' when a social method with provider='github' is registered", () => {
    expect(() =>
      validateBootstrap(
        { match: "github-login", value: "alice" },
        [GITHUB_METHOD_FIXTURE],
      ),
    ).not.toThrow();
  });

  it("throws when match='github-login' but no github social method is registered", () => {
    expect(() =>
      validateBootstrap(
        { match: "github-login", value: "alice" },
        [
          {
            kind: "social",
            provider: "google",
            clientId: "x",
            clientSecret: "y",
          },
        ],
      ),
    ).toThrow(/github-login.*github/i);
  });

  it("accepts match='email' regardless of registered methods", () => {
    // Every Better Auth method populates user.email; no method-specific
    // constraint to enforce.
    expect(() =>
      validateBootstrap(
        { match: "email", value: "alice@example.com" },
        [{ kind: "email-otp", sender: NULL_SENDER }],
      ),
    ).not.toThrow();
    expect(() =>
      validateBootstrap(
        { match: "email", value: "alice@example.com" },
        [],
      ),
    ).not.toThrow();
  });
});

describe("shouldPromoteToOwner", () => {
  const ghRule: BootstrapOwnerRule = { match: "github-login", value: "alice" };
  const emailRule: BootstrapOwnerRule = {
    match: "email",
    value: "alice@example.com",
  };

  it("matches github-login when user.githubLogin equals rule value", () => {
    expect(shouldPromoteToOwner(ghRule, { githubLogin: "alice" })).toBe(true);
  });

  it("matches github-login case-insensitively", () => {
    expect(shouldPromoteToOwner(ghRule, { githubLogin: "Alice" })).toBe(true);
    expect(
      shouldPromoteToOwner({ ...ghRule, value: "ALICE" }, { githubLogin: "alice" }),
    ).toBe(true);
  });

  it("trims rule value before comparison", () => {
    expect(
      shouldPromoteToOwner(
        { match: "github-login", value: "  alice  " },
        { githubLogin: "alice" },
      ),
    ).toBe(true);
  });

  it("rejects github-login when user.githubLogin is missing", () => {
    expect(shouldPromoteToOwner(ghRule, {})).toBe(false);
    expect(shouldPromoteToOwner(ghRule, { githubLogin: null })).toBe(false);
    expect(shouldPromoteToOwner(ghRule, { email: "alice@example.com" })).toBe(
      false,
    );
  });

  it("matches email rule case-insensitively", () => {
    expect(
      shouldPromoteToOwner(emailRule, { email: "Alice@Example.com" }),
    ).toBe(true);
  });

  it("rejects email rule when user.email is missing", () => {
    expect(shouldPromoteToOwner(emailRule, {})).toBe(false);
    expect(shouldPromoteToOwner(emailRule, { email: null })).toBe(false);
  });

  it("rejects when user.githubLogin and email both miss the rule value", () => {
    expect(
      shouldPromoteToOwner(ghRule, { githubLogin: "bob", email: "bob@example.com" }),
    ).toBe(false);
    expect(
      shouldPromoteToOwner(emailRule, {
        githubLogin: "alice",
        email: "bob@example.com",
      }),
    ).toBe(false);
  });
});

describe("buildSocialProviders", () => {
  it("emits per-provider config keyed by provider id", () => {
    const out = asProviderMap(
      buildSocialProviders([
        { kind: "social", provider: "github", clientId: "g_id", clientSecret: "g_s" },
        { kind: "social", provider: "google", clientId: "o_id", clientSecret: "o_s" },
      ]),
    );
    expect(out.github?.clientId).toBe("g_id");
    expect(out.github?.clientSecret).toBe("g_s");
    expect(out.google?.clientId).toBe("o_id");
    expect(out.google?.clientSecret).toBe("o_s");
  });

  it("injects mapProfileToUser shim only for github", () => {
    const out = asProviderMap(
      buildSocialProviders([
        GITHUB_METHOD_FIXTURE,
        { kind: "social", provider: "google", clientId: "o", clientSecret: "o" },
      ]),
    );
    const ghMap = out.github?.mapProfileToUser as (p: {
      login?: string;
    }) => Record<string, unknown>;
    expect(typeof ghMap).toBe("function");
    expect(ghMap({ login: "alice" })).toEqual({ githubLogin: "alice" });
    expect(out.google?.mapProfileToUser).toBeUndefined();
  });

  it("merges extras into the provider config", () => {
    const out = asProviderMap(
      buildSocialProviders([
        {
          kind: "social",
          provider: "microsoft-entra-id",
          clientId: "m",
          clientSecret: "m",
          extras: { tenantId: "common", prompt: "select_account" },
        },
      ]),
    );
    expect(out["microsoft-entra-id"]?.tenantId).toBe("common");
    expect(out["microsoft-entra-id"]?.prompt).toBe("select_account");
  });

  it("defensively copies the scope array — caller mutation doesn't leak", () => {
    // `scope: [...method.scope]` in buildSocialProviders. Mutating
    // the caller-side array must not affect what Better Auth sees.
    const scopes = ["openid", "profile"];
    const out = asProviderMap(
      buildSocialProviders([
        {
          kind: "social",
          provider: "google",
          clientId: "g",
          clientSecret: "g",
          scope: scopes,
        },
      ]),
    );
    scopes.push("email");
    expect(out.google?.scope).toEqual(["openid", "profile"]);
  });

  it("includes redirectURI and scope only when set", () => {
    const out = asProviderMap(
      buildSocialProviders([
        {
          kind: "social",
          provider: "google",
          clientId: "g",
          clientSecret: "g",
          redirectURI: "https://example.test/cb",
          scope: ["openid", "profile", "email"],
        },
      ]),
    );
    expect(out.google?.redirectURI).toBe("https://example.test/cb");
    expect(out.google?.scope).toEqual(["openid", "profile", "email"]);
  });

  it.each([
    "clientId",
    "clientSecret",
    "redirectURI",
    "scope",
    "mapProfileToUser",
  ])("throws when extras contains reserved key '%s'", (reserved) => {
    expect(() =>
      buildSocialProviders([
        {
          kind: "social",
          provider: "google",
          clientId: "g",
          clientSecret: "g",
          extras: { [reserved]: "shadow" },
        },
      ]),
    ).toThrow(new RegExp(`reserved key.*${reserved}`));
  });

  it("ignores non-social methods", () => {
    const out = asProviderMap(
      buildSocialProviders([
        { kind: "email-otp", sender: NULL_SENDER },
        { kind: "magic-link", sender: NULL_SENDER },
      ]),
    );
    expect(Object.keys(out)).toHaveLength(0);
  });
});

describe("createAuth — boot invariants", () => {
  it("throws when methods[] is empty", () => {
    expect(() => createAuth(baseConfig({ methods: [] }))).toThrow(/empty/i);
  });

  it("throws when bootstrapOwner.match='github-login' but no github method", () => {
    expect(() =>
      createAuth(
        baseConfig({
          methods: [{ kind: "email-otp", sender: NULL_SENDER }],
          bootstrapOwner: { match: "github-login", value: "alice" },
        }),
      ),
    ).toThrow(/github-login.*github/i);
  });

  it("throws when more than one email-otp method is registered", () => {
    expect(() =>
      createAuth(
        baseConfig({
          methods: [
            { kind: "email-otp", sender: NULL_SENDER },
            { kind: "email-otp", sender: NULL_SENDER },
          ],
        }),
      ),
    ).toThrow(/email-otp/i);
  });

  it("throws when more than one magic-link method is registered", () => {
    expect(() =>
      createAuth(
        baseConfig({
          methods: [
            { kind: "magic-link", sender: NULL_SENDER },
            { kind: "magic-link", sender: NULL_SENDER },
          ],
        }),
      ),
    ).toThrow(/magic-link/i);
  });

  it("throws when social.extras contains a reserved key", () => {
    expect(() =>
      createAuth(
        baseConfig({
          methods: [
            {
              kind: "social",
              provider: "google",
              clientId: "g",
              clientSecret: "g",
              extras: { clientSecret: "shadow" },
            },
          ],
        }),
      ),
    ).toThrow(/reserved key.*clientSecret/);
  });

  it("returns Auth.methods reflecting the registered methods, in declaration order", () => {
    const auth = createAuth(
      baseConfig({
        methods: [
          GITHUB_METHOD_FIXTURE,
          { kind: "email-otp", sender: NULL_SENDER },
          { kind: "magic-link", sender: NULL_SENDER },
          {
            kind: "social",
            provider: "google",
            clientId: "o",
            clientSecret: "o",
          },
        ],
        bootstrapOwner: { match: "email", value: "alice@example.com" },
      }),
    );
    expect(auth.methods).toEqual([
      { kind: "social", provider: "github" },
      { kind: "email-otp" },
      { kind: "magic-link" },
      { kind: "social", provider: "google" },
    ]);
  });

  it("returns an Auth surface with handler / getSession / getUserRole", () => {
    const auth = createAuth(baseConfig());
    expect(typeof auth.handler).toBe("function");
    expect(typeof auth.getSession).toBe("function");
    expect(typeof auth.getUserRole).toBe("function");
  });

  it("registers apple → constructs without throwing (auto-trustedOrigins ride internally)", () => {
    // We can't easily inspect the Better Auth instance's internal
    // `trustedOrigins` from outside (no public read-API), so the
    // unit test asserts the construction path doesn't throw and the
    // `Auth.methods` reflects the registration. A future integration
    // test against /api/auth/sign-in/social with provider=apple
    // would close the trustedOrigins claim end-to-end.
    const auth = createAuth(
      baseConfig({
        methods: [
          {
            kind: "social",
            provider: "apple",
            clientId: "com.example.web",
            clientSecret: "JWT-placeholder",
          },
        ],
        bootstrapOwner: { match: "email", value: "owner@example.com" },
      }),
    );
    expect(auth.methods).toEqual([{ kind: "social", provider: "apple" }]);
  });

  it("apple auto-applies sameSite='none' when registered", () => {
    // Apple uses response_mode=form_post — the state cookie needs
    // sameSite=none to ride the cross-site POST callback. Regression
    // guard: construct with Apple registered, ensure no throw and
    // Auth.methods reflects the registration.
    const auth = createAuth(
      baseConfig({
        methods: [
          {
            kind: "social",
            provider: "apple",
            clientId: "com.example.web",
            clientSecret: "JWT-placeholder",
          },
        ],
        bootstrapOwner: { match: "email", value: "owner@example.com" },
      }),
    );
    expect(auth.methods).toEqual([{ kind: "social", provider: "apple" }]);
  });

  it("constructs without throwing when accountLinking is configured", () => {
    // Better Auth's internal config isn't introspectable from outside
    // (no public read API). Construction-success regression guard for
    // the `account.accountLinking` forward path.
    const auth = createAuth(
      baseConfig({
        accountLinking: {
          enabled: true,
          trustedProviders: ["github", "google"],
          allowDifferentEmails: false,
          updateUserInfoOnLink: true,
        },
      }),
    );
    expect(typeof auth.handler).toBe("function");
  });

  it("constructs without throwing when session config is supplied", () => {
    const auth = createAuth(
      baseConfig({
        session: {
          expiresIn: 60 * 60 * 24 * 30,
          updateAge: 60 * 60 * 24,
          cookieCache: { enabled: true, maxAge: 300 },
        },
      }),
    );
    expect(typeof auth.handler).toBe("function");
  });

  it("constructs without throwing when emailVerification config is supplied", () => {
    const auth = createAuth(
      baseConfig({
        emailVerification: {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          expiresIn: 60 * 60,
        },
      }),
    );
    expect(typeof auth.handler).toBe("function");
  });

  it("omits accountLinking / session / emailVerification when adopter doesn't set them", () => {
    // Sanity: the defaulting path is "don't pass the key", so Better
    // Auth falls back to its own defaults. Construction must still
    // succeed with the empty baseConfig.
    const auth = createAuth(baseConfig());
    expect(typeof auth.handler).toBe("function");
  });

  it("accepts a partial accountLinking — omitted fields fall through to BA defaults", () => {
    // Adopter sets only `enabled: false`; trustedProviders /
    // allowDifferentEmails / updateUserInfoOnLink omitted. Should
    // construct.
    const auth = createAuth(baseConfig({ accountLinking: { enabled: false } }));
    expect(typeof auth.handler).toBe("function");
  });

  it("accepts cookieCache without explicit maxAge", () => {
    const auth = createAuth(
      baseConfig({ session: { cookieCache: { enabled: true } } }),
    );
    expect(typeof auth.handler).toBe("function");
  });
});

describe("AuthMethodConfig — type narrowing smoke", () => {
  // A compile-time-only check that the union narrows where expected.
  // Lives as a test so a future refactor that accidentally widens
  // the union surfaces here.
  it("narrows social method to social fields", () => {
    const method: AuthMethodConfig = GITHUB_METHOD_FIXTURE;
    if (method.kind === "social") {
      // `provider` only exists on the social variant
      expect(method.provider).toBe("github");
    }
  });

  it("narrows email-otp method to email-otp fields", () => {
    const method: AuthMethodConfig = {
      kind: "email-otp",
      sender: NULL_SENDER,
      otpLength: 6,
    };
    if (method.kind === "email-otp") {
      expect(method.otpLength).toBe(6);
    }
  });
});

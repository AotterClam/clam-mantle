import type { GithubProfile } from "@aotter/mantle-runtime";
import type { KvCache } from "@aotter/mantle-runtime";

/**
 * GitHub OAuth 2.0 (OAuth App) for the admin sign-in flow.
 *
 *   GET /admin/auth/github           → 302 to GitHub /authorize
 *   GET /admin/auth/github/callback  → exchange code, upsert user, issue session
 *
 * Uses Web Crypto for random state — no third-party OAuth lib.
 * Anti-CSRF state is stored in the KvCache port with a 10-minute TTL.
 */

const GH_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GH_TOKEN = "https://github.com/login/oauth/access_token";
const GH_USER = "https://api.github.com/user";

const STATE_TTL_S = 600;
const STATE_KEY_PREFIX = "gh:state:";

export interface StartAuthorizeOpts {
  readonly kv: KvCache;
  readonly origin: string;
  readonly githubClientId: string;
  /** Where to redirect the user after a successful callback. */
  readonly returnTo?: string;
}

/** Build the GitHub authorize URL and persist an anti-CSRF state token. */
export async function startAuthorize(opts: StartAuthorizeOpts): Promise<string> {
  const { kv, origin, githubClientId, returnTo = "/admin" } = opts;
  const state = randomState();
  await kv.put(`${STATE_KEY_PREFIX}${state}`, returnTo, { expirationTtl: STATE_TTL_S });
  const params = new URLSearchParams({
    client_id: githubClientId,
    redirect_uri: `${origin}/admin/auth/github/callback`,
    scope: "read:user user:email",
    state,
    allow_signup: "false",
  });
  return `${GH_AUTHORIZE}?${params.toString()}`;
}

export interface CallbackOpts {
  readonly kv: KvCache;
  readonly githubClientId: string;
  readonly githubClientSecret: string;
  readonly origin: string;
}

export interface CallbackResult {
  readonly profile: GithubProfile;
  readonly accessToken: string;
  readonly grantedScope: string;
  readonly returnTo: string;
}

export class CallbackError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CallbackError";
  }
}

/**
 * Handle the GitHub OAuth callback. Validates state, exchanges code for
 * an access token, fetches the GitHub user profile.
 * Throws `CallbackError` on any rejection.
 */
export async function handleCallback(opts: CallbackOpts, url: URL): Promise<CallbackResult> {
  const { kv, githubClientId, githubClientSecret, origin } = opts;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new CallbackError(400, "missing code or state");

  const stateKey = `${STATE_KEY_PREFIX}${state}`;
  const returnTo = await kv.get(stateKey);
  if (returnTo == null) throw new CallbackError(400, "state expired or unknown");
  await kv.delete(stateKey);

  const tokenRes = await fetch(GH_TOKEN, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: githubClientId,
      client_secret: githubClientSecret,
      code,
      redirect_uri: `${origin}/admin/auth/github/callback`,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenJson.access_token) {
    throw new CallbackError(
      400,
      `token exchange failed: ${tokenJson.error_description ?? tokenJson.error ?? "unknown"}`,
    );
  }

  const userRes = await fetch(GH_USER, {
    headers: {
      authorization: `Bearer ${tokenJson.access_token}`,
      accept: "application/vnd.github+json",
      "user-agent": "aotter-cms",
    },
  });
  if (!userRes.ok) throw new CallbackError(502, `GitHub /user fetch failed: HTTP ${userRes.status}`);
  const u = (await userRes.json()) as {
    id: number;
    login: string;
    email: string | null;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    profile: { id: u.id, login: u.login, email: u.email, name: u.name, avatarUrl: u.avatar_url },
    accessToken: tokenJson.access_token,
    grantedScope: tokenJson.scope ?? "",
    returnTo,
  };
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

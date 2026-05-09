import type { Context, Hono } from "hono";
import {
  HTTP_STATUS_BY_CODE,
  MCP_HINT_KEYWORD,
  VIEW_PARAMS_RESERVED,
  isMediaMcpHint,
  runtimeDiagnostic,
  type ContentState,
  type Diagnostic,
  type SchemaManifest,
} from "@aotter/mantle-spec";
import {
  DEFAULT_SESSION_COOKIE,
  ViewParamCoercionError,
  coerceViewParams,
  matchPath,
  readCookie,
  type CmsRuntime,
  type HandlerContext,
  type Session,
} from "@aotter/mantle-runtime";
import { indexHtml } from "@aotter/mantle-admin-ui";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";
import { ADMIN_ROLES, type AdminRole, type Auth } from "../auth/createAuth.js";
import { BypassToConsent } from "../oauth/oauthConstants.js";
import { CallbackError, handleCallback, startAuthorize } from "../oauth/githubOAuth.js";
import {
  detectConsentLocale,
  renderConsentHtml,
  type ConsentLocale,
  type ConsentModel,
} from "../oauth/consentHtml.js";

const [PAGE_PARAM, SHOW_PARAM] = VIEW_PARAMS_RESERVED;

/**
 * Mount the http Triggers in `ref.manifests` onto the consumer's Hono
 * app. Each Trigger with `source.kind: 'http'` gets a route at
 * `(method, path)`; the handler resolves the target Procedure,
 * extracts auth context, calls `runtime.invokeProcedure.execute`,
 * and maps the structured response onto an HTTP envelope:
 *
 *   - success → 200, JSON `{ ok: true, data }`
 *   - failure → status from `HTTP_STATUS_BY_CODE` (default 500),
 *               JSON `{ ok: false, diagnostic }`
 *
 * Path params `{name}` from the Trigger path bind to identically-named
 * fields on the Procedure input — POC ADR-0001 grammar.
 *
 * Each parsed View also auto-mounts at `GET /api/views/<name>`
 * (ADR-0012) — query string coerced via `coerceViewParams`,
 * pagination via reserved `?page=&show=`.
 */
export function mountServerEndpoints(app: Hono, ref: CmsRuntimeRef): void {
  for (const t of ref.manifests) {
    if (t.kind !== "Trigger") continue;
    const source = t.spec.source;
    if (source.kind !== "http") continue;
    const { method, path } = source;
    const honoPath = openApiToHono(path);
    const triggerName = t.metadata.name;
    app.on(method, honoPath, async (c) => {
      const runtime = await ref.get();
      const waitUntil = readWaitUntil(c);
      return handleHttpTrigger(c.req.raw, runtime, ref.auth, triggerName, path, waitUntil);
    });
  }
  for (const v of ref.manifests) {
    if (v.kind !== "View") continue;
    const viewName = v.metadata.name;
    app.get(`/api/views/${viewName}`, async (c) => {
      const runtime = await ref.get();
      return handleViewRequest(c.req.raw, runtime, viewName);
    });
  }

  if (ref.auth) {
    mountAdminBetterAuth(app, ref, ref.auth);
    return;
  }

  const { adminAuth } = ref;
  if (!adminAuth) return;
  const { oauthProvider } = adminAuth;

  // ── Admin SPA: shell + JSON API ─────────────────────────────────────
  //
  // Routing model: every path under `/admin` (except auth + api + the
  // static logout endpoint) returns the same `indexHtml` string. The
  // SPA reads `window.location.pathname` to choose a view, so the
  // server is just a path-agnostic asset server here.
  //
  // The HTML shell ships unauthenticated — the SPA fetches `/admin/api/me`
  // on mount and redirects to `/admin/sign-in` on 401. JSON endpoints
  // are gated server-side; non-staff bearers get 403 + AUTH_DENIED.
  const spa = (): Response =>
    new Response(indexHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  app.get("/admin", spa);
  app.get("/admin/", spa);
  app.get("/admin/sign-in", spa);
  app.get("/admin/c/:collection", spa);
  app.get("/admin/approvals", spa);
  app.get("/admin/preferences", spa);
  app.get("/admin/settings", spa);

  // ── /admin/api/* — JSON endpoints consumed by the SPA ───────────────
  app.get("/admin/api/me", async (c) => {
    const runtime = await ref.get();
    const session = await readSessionForAdmin(c, runtime);
    if (!session) return adminUnauthenticated(c, "/admin/api/me");
    const staff = await runtime.staff.readByUserId(session.userId);
    if (!staff) {
      const login = await runtime.users.findGithubLogin(session.userId);
      return adminNotStaff(c, "/admin/api/me", login);
    }
    const login = await runtime.users.findGithubLogin(session.userId);
    return jsonResponse(200, { login, role: staff.role, userId: session.userId });
  });

  app.get("/admin/api/collections", async (c) => {
    const runtime = await ref.get();
    const session = await readSessionForAdmin(c, runtime);
    if (!session) return adminUnauthenticated(c, "/admin/api/collections");
    const staff = await runtime.staff.readByUserId(session.userId);
    if (!staff) {
      const login = await runtime.users.findGithubLogin(session.userId);
      return adminNotStaff(c, "/admin/api/collections", login);
    }
    const schemas = ref.manifests.filter(
      (m): m is SchemaManifest => m.kind === "Schema",
    );
    // POC sidebar contract: translation children (those with
    // `spec.translates`) never appear in the sidebar — they fold into
    // their parent. The parent gets a `hasTranslations: true` flag so
    // the SPA can mark it with a globe icon.
    const translatedParents = new Set<string>();
    for (const s of schemas) {
      if (s.spec.translates) translatedParents.add(s.spec.translates.parent);
    }
    const collections = schemas
      .filter((s) => !s.spec.translates)
      .map((s) => ({
        name: s.metadata.name,
        title: s.spec.title,
        description: s.spec.description ?? null,
        lifecycle: s.spec.lifecycle ?? "simple",
        hasTranslations: translatedParents.has(s.metadata.name),
        mediaFields: mediaFieldsForCollection(s, schemas),
      }));
    return jsonResponse(200, { collections });
  });

  app.get("/admin/api/site", async (c) => {
    const runtime = await ref.get();
    const session = await readSessionForAdmin(c, runtime);
    if (!session) return adminUnauthenticated(c, "/admin/api/site");
    const staff = await runtime.staff.readByUserId(session.userId);
    if (!staff) {
      const login = await runtime.users.findGithubLogin(session.userId);
      return adminNotStaff(c, "/admin/api/site", login);
    }
    const site = await runtime.siteConfig.load();
    const url = new URL(c.req.url);
    const publicUrl = site.origin || url.origin;
    return jsonResponse(200, {
      ...site,
      publicUrl,
      mcpUrl: `${url.origin}/mcp`,
    });
  });

  app.get("/admin/api/entries", async (c) => {
    const runtime = await ref.get();
    const session = await readSessionForAdmin(c, runtime);
    if (!session) return adminUnauthenticated(c, "/admin/api/entries");
    const staff = await runtime.staff.readByUserId(session.userId);
    if (!staff) {
      const login = await runtime.users.findGithubLogin(session.userId);
      return adminNotStaff(c, "/admin/api/entries", login);
    }
    const collection = c.req.query("collection");
    if (!collection) {
      return jsonResponse(400, {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "INPUT_VALIDATION_FAILED",
          severity: "error",
          path: "GET /admin/api/entries",
          expected: "?collection=<name> query parameter",
          message: "Missing `collection` query parameter.",
        }),
      });
    }
    const status = c.req.query("status");
    const rows = await runtime.listEntries.execute({
      collection,
      status: status as ContentState | undefined,
    });
    const items = rows.map((row) => ({
      id: row.id,
      collection: row.collection,
      locale: row.locale ?? null,
      status: row.status,
      version: row.version,
      title: row.data.title,
      updated_at: row.updatedAt,
    }));
    return jsonResponse(200, { items, next_cursor: null });
  });

  // ── /admin/logout — POST clears session cookie + 302s to sign-in ────
  app.post("/admin/logout", async (c) => {
    const sessionToken = readCookie(c.req.raw, DEFAULT_SESSION_COOKIE);
    if (sessionToken) {
      const runtime = await ref.get();
      await runtime.sessions.invalidate(sessionToken);
    }
    const expired = `${DEFAULT_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
    return new Response(null, {
      status: 302,
      headers: { location: "/admin/sign-in", "set-cookie": expired },
    });
  });

  // ── GitHub admin sign-in ─────────────────────────────────────────────
  app.get("/admin/auth/github", async (c) => {
    const runtime = await ref.get();
    const url = new URL(c.req.url);
    const returnTo = c.req.query("return_to") ?? "/admin";
    let redirectUrl: string;
    try {
      redirectUrl = await startAuthorize({
        kv: runtime.kv,
        origin: url.origin,
        githubClientId: adminAuth.githubClientId,
        returnTo,
      });
    } catch (err) {
      return jsonError({ status: 500, code: "INTERNAL_ERROR", message: String(err) });
    }
    return new Response(null, { status: 302, headers: { location: redirectUrl } });
  });

  app.get("/admin/auth/github/callback", async (c) => {
    const runtime = await ref.get();
    const url = new URL(c.req.url);
    let cbResult: Awaited<ReturnType<typeof handleCallback>>;
    try {
      cbResult = await handleCallback(
        {
          kv: runtime.kv,
          githubClientId: adminAuth.githubClientId,
          githubClientSecret: adminAuth.githubClientSecret,
          origin: url.origin,
        },
        url,
      );
    } catch (err) {
      if (err instanceof CallbackError) {
        return jsonError({ status: err.status, code: "AUTH_DENIED", message: err.message });
      }
      throw err;
    }

    const now = Date.now();
    const userId = await runtime.users.upsertByGithub(cbResult.profile, now);
    await Promise.all([
      runtime.users.storeGithubToken(userId, cbResult.accessToken, cbResult.grantedScope, now),
      runtime.staff.ensureBootstrapOwner({
        userId,
        githubLogin: cbResult.profile.login,
        adminGithubLogin: adminAuth.adminGithubLogin,
        now,
      }),
    ]);

    const session: Session = {
      token: crypto.randomUUID(),
      userId,
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    };
    await runtime.sessions.write(session);
    const maxAge = Math.floor((session.expiresAt - now) / 1000);
    const cookie = `${DEFAULT_SESSION_COOKIE}=${session.token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
    return new Response(null, {
      status: 302,
      headers: { location: cbResult.returnTo, "set-cookie": cookie },
    });
  });

  // ── OAuth consent UI ─────────────────────────────────────────────────
  // The OAuthProvider injects per-request OAUTH_PROVIDER helpers onto env
  // then throws BypassToConsent. We catch that throw and render the consent
  // UI using those helpers.
  const oauthEnv = { OAUTH_KV: adminAuth.oauthKv };

  const consentHandler = async (c: Context): Promise<Response> => {
    const runtime = await ref.get();
    const locale = detectConsentLocale(c.req.header("accept-language") ?? null);

    const augmented: { OAUTH_KV: KVNamespace; OAUTH_PROVIDER?: OAuthHelpers } = { ...oauthEnv };
    try {
      await oauthProvider.fetch(c.req.raw, augmented as never, safeExecutionCtx(c));
    } catch (e) {
      if (!(e instanceof BypassToConsent)) throw e;
    }
    if (!augmented.OAUTH_PROVIDER) {
      return jsonError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: "OAUTH_PROVIDER not injected — check OAuthProvider configuration.",
      });
    }
    const oauthHelpers = augmented.OAUTH_PROVIDER;

    const sessionToken = readCookie(c.req.raw, DEFAULT_SESSION_COOKIE);
    const session = sessionToken ? await runtime.sessions.read(sessionToken) : null;
    if (!session) {
      if (c.req.method !== "GET") {
        return jsonResponse(401, {
          ok: false,
          diagnostic: runtimeDiagnostic({
            code: "UNAUTHENTICATED",
            severity: "error",
            path: `${c.req.method} /oauth/authorize`,
            expected: "active staff session cookie",
            message: "Not signed in. Sign in via /admin/sign-in first.",
          }),
        });
      }
      const u = new URL(c.req.url);
      const returnTo = encodeURIComponent(u.pathname + u.search);
      return new Response(null, {
        status: 302,
        headers: { location: `/admin/auth/github?return_to=${returnTo}` },
      });
    }

    const staff = await runtime.staff.readByUserId(session.userId);
    if (!staff) {
      return jsonResponse(403, {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "AUTH_DENIED",
          severity: "error",
          path: `${c.req.method} /oauth/authorize`,
          expected: "active staff membership",
          message: "Only staff members may approve OAuth grants.",
        }),
      });
    }

    if (c.req.method === "POST") return handleConsentPost(c, runtime, session, oauthHelpers);
    return handleConsentGet(c, runtime, locale, oauthHelpers);
  };

  app.get("/oauth/authorize", consentHandler);
  app.post("/oauth/authorize", consentHandler);

  // ── OAuth provider passthrough (discovery / token / register) ─────────
  //
  // MCP clients discover the authorization server and protected resource
  // metadata through /.well-known before they can open the consent screen.
  const providerFetch = (c: Context) =>
    oauthProvider.fetch(c.req.raw, oauthEnv as never, safeExecutionCtx(c));
  app.all("/.well-known/oauth-authorization-server", providerFetch);
  app.all("/.well-known/oauth-authorization-server/*", providerFetch);
  app.all("/.well-known/oauth-protected-resource", providerFetch);
  app.all("/.well-known/oauth-protected-resource/*", providerFetch);
  app.all("/oauth/token", (c) =>
    oauthProvider.fetch(c.req.raw, oauthEnv as never, safeExecutionCtx(c)),
  );
  app.all("/oauth/register", (c) =>
    oauthProvider.fetch(c.req.raw, oauthEnv as never, safeExecutionCtx(c)),
  );
}

function mountAdminBetterAuth(app: Hono, ref: CmsRuntimeRef, auth: Auth): void {
  const spa = (): Response =>
    new Response(indexHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  for (const path of [
    "/admin",
    "/admin/",
    "/admin/sign-in",
    "/admin/c/:collection",
    "/admin/approvals",
    "/admin/preferences",
    "/admin/settings",
  ]) {
    app.get(path, spa);
  }

  // Pre-derive the collections projection — `ref.manifests` is
  // immutable post-boot, so the filter / Set / mediaFields work doesn't
  // need to repeat per request.
  const schemas = ref.manifests.filter(
    (m): m is SchemaManifest => m.kind === "Schema",
  );
  const translatedParents = new Set<string>();
  for (const s of schemas) {
    if (s.spec.translates) translatedParents.add(s.spec.translates.parent);
  }
  const collections = schemas
    .filter((s) => !s.spec.translates)
    .map((s) => ({
      name: s.metadata.name,
      title: s.spec.title,
      description: s.spec.description ?? null,
      lifecycle: s.spec.lifecycle ?? "simple",
      hasTranslations: translatedParents.has(s.metadata.name),
      mediaFields: mediaFieldsForCollection(s, schemas),
    }));

  type AdminGateOk = Extract<AdminGate, { kind: "ok" }>;
  const guarded = (
    path: string,
    body: (c: Context, gate: AdminGateOk) => Response | Promise<Response>,
  ): void => {
    app.get(path, async (c) => {
      const gate = await readAdminGate(c, auth);
      if (gate.kind === "unauth") return adminUnauthenticated(c, path);
      if (gate.kind === "forbidden") return adminNotStaff(c, path, gate.login);
      return body(c, gate);
    });
  };

  guarded("/admin/api/me", (_c, gate) =>
    jsonResponse(200, { login: gate.login, role: gate.role, userId: gate.userId }),
  );

  guarded("/admin/api/collections", () => jsonResponse(200, { collections }));

  guarded("/admin/api/site", async (c) => {
    const runtime = await ref.get();
    const site = await runtime.siteConfig.load();
    const url = new URL(c.req.url);
    return jsonResponse(200, {
      ...site,
      publicUrl: site.origin || url.origin,
      mcpUrl: `${url.origin}/mcp`,
    });
  });

  guarded("/admin/api/entries", async (c) => {
    const collection = c.req.query("collection");
    if (!collection) {
      return jsonResponse(400, {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "INPUT_VALIDATION_FAILED",
          severity: "error",
          path: "GET /admin/api/entries",
          expected: "?collection=<name> query parameter",
          message: "Missing `collection` query parameter.",
        }),
      });
    }
    const runtime = await ref.get();
    const rows = await runtime.listEntries.execute({
      collection,
      status: c.req.query("status") as ContentState | undefined,
    });
    const items = rows.map((row) => ({
      id: row.id,
      collection: row.collection,
      locale: row.locale ?? null,
      status: row.status,
      version: row.version,
      title: row.data.title,
      updated_at: row.updatedAt,
    }));
    return jsonResponse(200, { items, next_cursor: null });
  });
}

type AdminGate =
  | { kind: "unauth" }
  | { kind: "forbidden"; login: string | null }
  | {
      kind: "ok";
      userId: string;
      login: string | null;
      role: AdminRole;
    };

const ADMIN_ROLES_FOR_GATE: ReadonlySet<string> = new Set(ADMIN_ROLES);

async function readAdminGate(c: Context, auth: Auth): Promise<AdminGate> {
  const session = await auth.getSession(c.req.raw);
  if (!session) return { kind: "unauth" };
  const role = session.user.role ?? null;
  const login = session.user.githubLogin ?? null;
  if (!role || !ADMIN_ROLES_FOR_GATE.has(role)) {
    return { kind: "forbidden", login };
  }
  return {
    kind: "ok",
    userId: session.user.id,
    login,
    role: role as AdminRole,
  };
}

type OAuthHelpers = {
  parseAuthRequest(req: Request): Promise<{ clientId: string; redirectUri: string; scope?: readonly string[] }>;
  lookupClient(clientId: string): Promise<{ clientName?: string } | null>;
  completeAuthorization(opts: {
    request: unknown;
    userId: string;
    metadata: Record<string, unknown>;
    scope: readonly string[];
    props: Record<string, unknown>;
  }): Promise<{ redirectTo: string }>;
};

async function handleConsentGet(
  c: Context,
  runtime: CmsRuntime,
  locale: ConsentLocale,
  oauthHelpers: OAuthHelpers,
): Promise<Response> {
  let model: ConsentModel | null = null;
  try {
    const reqInfo = await oauthHelpers.parseAuthRequest(c.req.raw);
    const clientInfo = await oauthHelpers.lookupClient(reqInfo.clientId);
    model = {
      clientName: clientInfo?.clientName ?? "(unknown client)",
      redirectUri: reqInfo.redirectUri,
      scopes: reqInfo.scope ?? [],
      oauthRequestJson: JSON.stringify(reqInfo),
    };
  } catch {
    // parseAuthRequest may throw on malformed requests.
  }
  return new Response(renderConsentHtml(locale, model), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function handleConsentPost(
  c: Context,
  runtime: CmsRuntime,
  session: Session,
  oauthHelpers: OAuthHelpers,
): Promise<Response> {
  const form = await c.req.raw.formData();
  const oauthRequestJson = form.get("oauth_request");
  if (typeof oauthRequestJson !== "string") {
    return jsonResponse(400, {
      ok: false,
      diagnostic: runtimeDiagnostic({
        code: "INPUT_VALIDATION_FAILED",
        severity: "error",
        path: "POST /oauth/authorize#/body/oauth_request",
        expected: "form-encoded `oauth_request` string",
        message: "Missing `oauth_request` form field.",
      }),
    });
  }
  if (form.get("decision") !== "approve") {
    return jsonResponse(400, {
      ok: false,
      diagnostic: runtimeDiagnostic({
        code: "AUTH_DENIED",
        severity: "error",
        path: "POST /oauth/authorize#/body/decision",
        expected: "decision=approve",
        message: "Authorization denied by user.",
      }),
    });
  }
  let reqInfo: { scope?: readonly string[] } & Record<string, unknown>;
  try {
    reqInfo = JSON.parse(oauthRequestJson) as typeof reqInfo;
  } catch {
    return jsonResponse(400, {
      ok: false,
      diagnostic: runtimeDiagnostic({
        code: "INPUT_VALIDATION_FAILED",
        severity: "error",
        path: "POST /oauth/authorize#/body/oauth_request",
        expected: "valid JSON-encoded OAuth request payload",
        message: "Could not parse `oauth_request` as JSON.",
      }),
    });
  }
  const ghToken = await runtime.users.readGithubToken(session.userId);
  const { redirectTo } = await oauthHelpers.completeAuthorization({
    request: reqInfo,
    userId: session.userId,
    metadata: {},
    scope: reqInfo.scope ?? [],
    props: {
      userId: session.userId,
      ...(ghToken ? { githubAccessToken: ghToken.accessToken, githubScope: ghToken.scope } : {}),
    },
  });
  return new Response(null, { status: 302, headers: { location: redirectTo } });
}

async function handleHttpTrigger(
  req: Request,
  runtime: CmsRuntime,
  auth: Auth | null,
  triggerName: string,
  triggerPath: string,
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
): Promise<Response> {
  const trigger = runtime.triggersByName.get(triggerName);
  if (!trigger) {
    return jsonError({ status: 500, code: "INTERNAL_ERROR", message: `Trigger '${triggerName}' missing post-boot.` });
  }
  const procName = trigger.spec.target.procedure;
  const procedure = runtime.proceduresByName.get(procName);
  if (!procedure) {
    return jsonError({ status: 500, code: "INTERNAL_ERROR", message: `Procedure '${procName}' missing post-boot.` });
  }

  const url = new URL(req.url);
  const params = matchPath(triggerPath, url.pathname) ?? {};
  const body = await readBody(req);
  // Spread order matters: URL path params are authoritative for the
  // resource identifier (a `DELETE /entries/{id}` body MUST NOT spoof
  // `id`). Body fields fill in non-path inputs only.
  const input = { ...body, ...params };

  const ctx: HandlerContext = await buildHandlerContext(req, runtime, auth, waitUntil);

  const result = await runtime.invokeProcedure.execute({
    procedure,
    input,
    ctx,
    pathPrefix: `${req.method} ${triggerPath}`,
  });

  if (result.ok) {
    return jsonResponse(200, { ok: true, data: result.data });
  }
  const status = HTTP_STATUS_BY_CODE[result.diagnostic.code] ?? 500;
  return jsonResponse(status, { ok: false, diagnostic: result.diagnostic });
}

async function handleViewRequest(
  req: Request,
  runtime: CmsRuntime,
  viewName: string,
): Promise<Response> {
  const view = runtime.viewsByName.get(viewName);
  if (!view) {
    return jsonError({ status: 500, code: "INTERNAL_ERROR", message: `View '${viewName}' missing post-boot.` });
  }

  const url = new URL(req.url);
  const viewPath = `GET /api/views/${viewName}`;

  const page = parsePositiveInt(url.searchParams.get(PAGE_PARAM));
  const show = parsePositiveInt(url.searchParams.get(SHOW_PARAM));

  let params: Record<string, unknown>;
  try {
    params = coerceViewParams(view, url.searchParams);
  } catch (err) {
    if (err instanceof ViewParamCoercionError) {
      return jsonResponse(400, {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "INPUT_VALIDATION_FAILED",
          severity: "error",
          path: viewPath,
          expected: "query string conforms to View.spec.params",
          message: err.message,
        }),
      });
    }
    throw err;
  }

  const result = await runtime.executeView.execute({
    view,
    pathPrefix: viewPath,
    options: { params, page, show },
  });

  if (result.ok) {
    return jsonResponse(200, { ok: true, data: result.result });
  }
  const status = HTTP_STATUS_BY_CODE[result.diagnostic.code] ?? 500;
  return jsonResponse(status, { ok: false, diagnostic: result.diagnostic });
}

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET" || req.method === "DELETE" || req.method === "HEAD") {
    return {};
  }
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return {};
  try {
    const parsed = await req.json<Record<string, unknown>>();
    return parsed ?? {};
  } catch {
    return {};
  }
}

async function buildHandlerContext(
  req: Request,
  runtime: CmsRuntime,
  auth: Auth | null,
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
): Promise<HandlerContext> {
  const wu = waitUntil ? { waitUntil } : {};
  if (auth) {
    const session = await auth.getMcpSession(req);
    if (!session) return { user: null, staff: null, env: {}, ...wu };
    const role = await auth.getUserRole(session.userId);
    const staff =
      role && ADMIN_ROLES_FOR_GATE.has(role)
        ? { id: session.userId, role: role as AdminRole }
        : null;
    return { user: { id: session.userId }, staff, env: {}, ...wu };
  }
  const identity = await runtime.oauth.verifyAccessToken(req);
  if (!identity) return { user: null, staff: null, env: {}, ...wu };
  const staffRow = await runtime.staff.readByUserId(identity.userId);
  const staff = staffRow ? { id: staffRow.userId, role: staffRow.role } : null;
  return { user: { id: identity.userId }, staff, env: {}, ...wu };
}

function openApiToHono(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

/**
 * Hono's `c.executionCtx` getter THROWS when the underlying request
 * was dispatched without an `ExecutionContext` (test harness via
 * `app.request(...)`, non-Workers runtimes). Treat the throw as
 * "no waitUntil available" and fall back to inline-await downstream.
 */
function readWaitUntil(c: Context): ((p: Promise<unknown>) => void) | undefined {
  try {
    const ctx = c.executionCtx;
    return ctx.waitUntil.bind(ctx);
  } catch {
    return undefined;
  }
}

/** Safe variant for callers that need the full ExecutionContext (OAuth provider). */
function safeExecutionCtx(c: Context): ExecutionContext {
  try {
    return c.executionCtx;
  } catch {
    return { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mediaFieldsForCollection(
  schema: SchemaManifest,
  schemas: readonly SchemaManifest[],
): Array<{ name: string; hint: string }> {
  const related = [
    schema,
    ...schemas.filter((s) => s.spec.translates?.parent === schema.metadata.name),
  ];
  const out: Array<{ name: string; hint: string }> = [];
  for (const s of related) {
    out.push(...mediaFieldsForSchema(s));
  }
  return out;
}

function mediaFieldsForSchema(schema: SchemaManifest): Array<{ name: string; hint: string }> {
  const props =
    (schema.spec.schema as { properties?: Record<string, unknown> }).properties ?? {};
  const out: Array<{ name: string; hint: string }> = [];
  for (const [name, prop] of Object.entries(props)) {
    if (typeof prop !== "object" || prop === null) continue;
    const hint = (prop as Record<string, unknown>)[MCP_HINT_KEYWORD];
    if (!isMediaMcpHint(hint)) continue;
    out.push({ name, hint });
  }
  return out;
}

async function readSessionForAdmin(
  c: Context,
  runtime: CmsRuntime,
): Promise<Session | null> {
  const token = readCookie(c.req.raw, DEFAULT_SESSION_COOKIE);
  if (!token) return null;
  return runtime.sessions.read(token);
}

function adminUnauthenticated(c: Context, path: string): Response {
  return jsonResponse(401, {
    ok: false,
    diagnostic: runtimeDiagnostic({
      code: "UNAUTHENTICATED",
      severity: "error",
      path: `${c.req.method} ${path}`,
      expected: "active session cookie",
      message: "Not signed in. Sign in via /admin/sign-in first.",
    }),
  });
}

// Distinct from UNAUTHENTICATED so the SPA can render an "access
// denied" view for users who DID sign in but lack a staff row,
// instead of bouncing them back to /admin/sign-in (which the OAuth
// re-auth then silently fast-forwards through, producing a visible
// 5-step redirect chain that looks like an infinite loop).
function adminNotStaff(c: Context, path: string, login: string | null): Response {
  return jsonResponse(403, {
    ok: false,
    login,
    diagnostic: runtimeDiagnostic({
      code: "AUTH_DENIED",
      severity: "error",
      path: `${c.req.method} ${path}`,
      expected: "staff role for the signed-in user",
      message:
        "Signed in, but this account isn't on the admin staff list. Contact a site owner to be added.",
    }),
  });
}

function jsonError(args: { status: number; code: string; message: string }): Response {
  const diagnostic: Partial<Diagnostic> = {
    code: args.code as Diagnostic["code"],
    severity: "error",
    phase: "runtime",
    path: "mount/http",
    message: args.message,
  };
  return jsonResponse(args.status, { ok: false, diagnostic });
}

export type { CmsRuntimeRef };

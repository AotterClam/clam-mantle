import type { Context, Hono } from "hono";
import {
  DiagnosticError,
  HTTP_STATUS_BY_CODE,
  MCP_HINT_KEYWORD,
  VIEW_PARAMS_RESERVED,
  isMediaMcpHint,
  redactForWire,
  runtimeDiagnostic,
  type ContentState,
  type Diagnostic,
  type SchemaManifest,
} from "@aotter/mantle-spec";
import {
  ViewParamCoercionError,
  coerceViewParams,
  evaluateAuthAll,
  matchPath,
  type CmsRuntime,
  type HandlerContext,
} from "@aotter/mantle-runtime";
import { indexHtml } from "@aotter/mantle-admin-ui";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";
import { STAFF_ROLE_SET, type StaffRole, type Auth } from "../auth/createAuth.js";
import { AOTTER_FAVICON_SVG } from "../assets/aotterFavicon.js";

const [PAGE_PARAM, SHOW_PARAM] = VIEW_PARAMS_RESERVED;

/** Mount HTTP Triggers + Views + the Better Auth admin surface.
 *  HTTP Trigger bearer-token authentication is delegated to the OAuth
 *  provider lib (via `createMcpApiHandler`) — if a Trigger needs
 *  identity, route it under an MCP `apiHandler` instead of a Hono
 *  catch-all. */
export function mountServerEndpoints(
  app: Hono,
  ref: CmsRuntimeRef,
): void {
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
      const waitUntil = readWaitUntil(c);
      return handleViewRequest(c.req.raw, runtime, viewName, ref.auth, waitUntil);
    });
  }
  mountAdminBetterAuth(app, ref, ref.auth);
}

function mountAdminBetterAuth(app: Hono, ref: CmsRuntimeRef, auth: Auth): void {
  const spa = (): Response =>
    new Response(indexHtml, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

  app.get("/favicon.svg", () =>
    new Response(AOTTER_FAVICON_SVG, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    }),
  );

  // Public read-only manifest of registered sign-in methods. The admin
  // SPA hits this on sign-in-page mount so it can render per-method
  // sections without baking the method list into its build. No secrets
  // or sender refs — only the `kind` strings.
  //
  // `Cache-Control: no-store` because the list reflects deploy-time
  // config; if the operator rolls a new method, a CDN-cached response
  // would silently misroute the sign-in UI until the cache expires.
  app.get("/api/auth/methods", () =>
    Response.json({ methods: auth.methods }, {
      headers: { "cache-control": "no-store" },
    }),
  );

  // Better Auth handles the rest of `/api/auth/*` (sign-in, callback,
  // session, magic-link, OTP, OAuth provider routes). Owned by the SDK
  // so consumers don't have to wire — and can't accidentally register a
  // catch-all BEFORE the specific routes above and silently swallow
  // them. Hono matches in registration order; this catch-all sits last.
  app.all("/api/auth/*", (c) => auth.handler(c.req.raw));

  // Well-known OAuth endpoints (RFC 8414 + RFC 9728) used to be
  // forwarded to Better Auth's mcp() plugin here. With the carve-out
  // to @cloudflare/workers-oauth-provider (PR #193), the top-level
  // `OAuthProvider` serves AS metadata and per-resource PRM
  // automatically — adopters wire it via `createOAuthProvider` +
  // `createMcpApiHandler` from the package index. No SDK-level
  // forwarder needed in `mountServerEndpoints`.

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

  type StaffGateOk = Extract<StaffGate, { kind: "ok" }>;
  const guarded = (
    method: "get" | "post",
    path: string,
    body: (c: Context, gate: StaffGateOk) => Response | Promise<Response>,
  ): void => {
    app.on(method.toUpperCase(), path, async (c) => {
      const gate = await readStaffGate(c, auth);
      if (gate.kind === "unauth") return adminUnauthenticated(c, path);
      if (gate.kind === "forbidden") return adminNotStaff(c, path, gate.login);
      return body(c, gate);
    });
  };

  guarded("get", "/admin/api/me", (_c, gate) =>
    jsonResponse(200, { login: gate.login, role: gate.role, userId: gate.userId }),
  );

  guarded("get", "/admin/api/collections", () => jsonResponse(200, { collections }));

  guarded("get", "/admin/api/site", async (c) => {
    const runtime = await ref.get();
    const site = await runtime.siteConfig.load();
    const url = new URL(c.req.url);
    return jsonResponse(200, {
      ...site,
      publicUrl: site.origin || url.origin,
      mcpUrl: `${url.origin}/mcp/staff`,
      staffMcpUrl: `${url.origin}/mcp/staff`,
      userMcpUrl: `${url.origin}/mcp`,
    });
  });

  guarded("get", "/admin/api/entries", async (c) => {
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
    const rawLimit = c.req.query("limit");
    const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
    // Admin pagination needs the cursored shape — `executePage` returns
    // `{ rows, nextCursor? }`. `execute()` is the flat-array variant
    // for app code.
    const result = await runtime.listEntries.executePage({
      collection,
      status: c.req.query("status") as ContentState | undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor: c.req.query("cursor") ?? undefined,
    });
    const items = result.rows.map((row) => ({
      id: row.id,
      collection: row.collection,
      locale: row.locale ?? null,
      status: row.status,
      version: row.version,
      title: row.data.title,
      updated_at: row.updatedAt,
    }));
    return jsonResponse(200, { items, next_cursor: result.nextCursor ?? null });
  });

  // Two-step multi-variant direct-upload flow (#272):
  //   POST /uploads (variants manifest) → caller PUTs every variant
  //   directly to R2 S3 (Worker bypassed) → POST /uploads/:groupId/commit.
  const MEDIA_UPLOADS_PATH = "/admin/api/media/uploads";
  const MEDIA_COMMIT_PATH = "/admin/api/media/uploads/:uploadGroupId/commit";

  guarded("post", MEDIA_UPLOADS_PATH, async (c) => {
    const runtime = await ref.get();
    const media = runtime.media;
    if (!media) return mediaNotConfiguredResponse(`POST ${MEDIA_UPLOADS_PATH}`);
    const body = (await c.req.raw.json().catch(() => ({}))) as {
      filename?: unknown;
      purpose?: unknown;
      variants?: unknown;
      alt?: unknown;
      caption?: unknown;
    };
    if (
      typeof body.filename !== "string" ||
      typeof body.purpose !== "string" ||
      !Array.isArray(body.variants)
    ) {
      return jsonResponse(400, {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "INPUT_VALIDATION_FAILED",
          severity: "error",
          path: `POST ${MEDIA_UPLOADS_PATH}`,
          expected:
            "{ filename: string, purpose: string, variants: [{ mimeType, byteSize, role }, ...] }",
        }),
      });
    }
    const variants: Array<{ mimeType: string; byteSize: number; role: "primary" | "alternate" | "fallback" }> = [];
    for (const raw of body.variants) {
      if (raw === null || typeof raw !== "object") {
        return jsonResponse(400, {
          ok: false,
          diagnostic: runtimeDiagnostic({
            code: "INPUT_VALIDATION_FAILED",
            severity: "error",
            path: `POST ${MEDIA_UPLOADS_PATH}`,
            expected: "variants[] entries are objects with { mimeType, byteSize, role }",
          }),
        });
      }
      const v = raw as Record<string, unknown>;
      const mimeType = v["mimeType"];
      const byteSize = v["byteSize"];
      const role = v["role"];
      if (
        typeof mimeType !== "string" ||
        typeof byteSize !== "number" ||
        !Number.isSafeInteger(byteSize) ||
        byteSize <= 0 ||
        (role !== "primary" && role !== "alternate" && role !== "fallback")
      ) {
        return jsonResponse(400, {
          ok: false,
          diagnostic: runtimeDiagnostic({
            code: "INPUT_VALIDATION_FAILED",
            severity: "error",
            path: `POST ${MEDIA_UPLOADS_PATH}`,
            expected:
              "each variant: { mimeType: string, byteSize: positive integer, role: 'primary'|'alternate'|'fallback' }",
          }),
        });
      }
      variants.push({ mimeType, byteSize, role });
    }
    const { filename, purpose } = body;
    return runUseCase(`POST ${MEDIA_UPLOADS_PATH}`, () =>
      media.createUpload.execute({
        filename,
        purpose,
        variants,
        alt: typeof body.alt === "string" ? body.alt : undefined,
        caption: typeof body.caption === "string" ? body.caption : undefined,
      }),
    );
  });

  guarded("post", MEDIA_COMMIT_PATH, async (c) => {
    const runtime = await ref.get();
    const media = runtime.media;
    if (!media) return mediaNotConfiguredResponse(`POST ${MEDIA_COMMIT_PATH}`);
    // Hono only invokes this handler when the route matched, so the
    // path param is always present at runtime.
    const uploadGroupId = c.req.param("uploadGroupId")!;
    const body = (await c.req.raw.json().catch(() => ({}))) as {
      alt?: unknown;
      caption?: unknown;
    };
    return runUseCase(`POST ${MEDIA_COMMIT_PATH}`, () =>
      media.commitUpload.execute({
        uploadGroupId,
        alt: typeof body.alt === "string" ? body.alt : undefined,
        caption: typeof body.caption === "string" ? body.caption : undefined,
      }),
    );
  });
}

type StaffGate =
  | { kind: "unauth" }
  | { kind: "forbidden"; login: string | null }
  | {
      kind: "ok";
      userId: string;
      login: string | null;
      role: StaffRole;
    };

async function readStaffGate(c: Context, auth: Auth): Promise<StaffGate> {
  const session = await auth.getSession(c.req.raw);
  if (!session) return { kind: "unauth" };
  const role = session.user.role ?? null;
  const login = session.user.githubLogin ?? null;
  if (!role || !STAFF_ROLE_SET.has(role)) {
    return { kind: "forbidden", login };
  }
  return {
    kind: "ok",
    userId: session.user.id,
    login,
    role: role as StaffRole,
  };
}

async function handleHttpTrigger(
  req: Request,
  runtime: CmsRuntime,
  auth: Auth,
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

  const triggerPathPrefix = `${req.method} ${triggerPath}`;
  const ctx = await buildCallerContext(req, auth, waitUntil);

  // Mirror the View handler's 401-vs-403 discipline (see
  // `handleViewRequest`). An auth-gated Procedure called with no
  // session is UNAUTHENTICATED (401); a session whose role fails the
  // predicate is AUTH_DENIED (403). InvokeProcedureUseCase collapses
  // both into AUTH_DENIED if we pass `{ user: null, staff: null }`
  // as ctx, so we pre-check here.
  if (procedure.spec.requires?.auth && !ctx) {
    return jsonResponse(401, {
      ok: false,
      diagnostic: runtimeDiagnostic({
        code: "UNAUTHENTICATED",
        severity: "error",
        path: triggerPathPrefix,
        expected: "authenticated session",
        message: `Procedure '${procName}' requires authentication.`,
      }),
    });
  }

  const wu = waitUntil ? { waitUntil } : {};
  const invokeCtx: HandlerContext = ctx ?? { user: null, staff: null, env: {}, ...wu };

  const result = await runtime.invokeProcedure.execute({
    procedure,
    input,
    ctx: invokeCtx,
    pathPrefix: triggerPathPrefix,
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
  auth: Auth,
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
): Promise<Response> {
  const view = runtime.viewsByName.get(viewName);
  if (!view) {
    return jsonError({ status: 500, code: "INTERNAL_ERROR", message: `View '${viewName}' missing post-boot.` });
  }

  const viewPath = `GET /api/views/${viewName}`;

  // Resolve caller identity FIRST and evaluate `requires.auth.all`
  // BEFORE param coercion. Two reasons:
  //   (1) a param-coercion 400 against an auth-gated View would leak
  //       the View's parameter contract to an unauthorized caller —
  //       this matters for both anonymous probes AND authenticated
  //       users without the required role.
  //   (2) the UNAUTHENTICATED branch in ExecuteViewUseCase only fires
  //       when ctx is undefined, so passing a guest ctx for no-session
  //       would collapse 401 and 403 into the same AUTH_DENIED.
  const ctx = await buildCallerContext(req, auth, waitUntil);
  if (view.spec.requires?.auth) {
    if (!ctx) {
      return jsonResponse(401, {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "UNAUTHENTICATED",
          severity: "error",
          path: viewPath,
          expected: "authenticated session",
          message: `View '${viewName}' requires authentication.`,
        }),
      });
    }
    const denial = evaluateAuthAll(view.spec.requires, ctx, viewPath, "runtime");
    if (denial) {
      return jsonResponse(HTTP_STATUS_BY_CODE[denial.code] ?? 403, {
        ok: false,
        diagnostic: denial,
      });
    }
  }

  const url = new URL(req.url);
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
    ctx,
  });

  if (result.ok) {
    return jsonResponse(200, { ok: true, data: result.result });
  }
  const status = HTTP_STATUS_BY_CODE[result.diagnostic.code] ?? 500;
  return jsonResponse(status, { ok: false, diagnostic: result.diagnostic });
}

/**
 * Resolve caller identity for a View or HTTP-Trigger request from the
 * Better Auth cookie session. Returns `undefined` when there is no
 * session so callers can distinguish 401 (no session) from 403
 * (session but wrong role) — `ExecuteViewUseCase` and the
 * `handleHttpTrigger` pre-check both rely on this signal.
 *
 * Used by both `handleViewRequest` and `handleHttpTrigger` so the
 * two HTTP surfaces resolve identity identically.
 *
 * Note: this resolves cookie sessions only. OAuth bearer tokens
 * (issued by `createOAuthProvider` for MCP callers) are NOT verified
 * here — bearer-authenticated identity belongs on the MCP surface,
 * not the HTTP Trigger surface, so a bearer-only caller hitting an
 * auth-gated Trigger will land at the 401 branch in
 * `handleHttpTrigger`. Procedures that need to be agent-callable
 * should be reached via `/mcp` or `/mcp/staff` (see #281).
 */
async function buildCallerContext(
  req: Request,
  auth: Auth,
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
): Promise<HandlerContext | undefined> {
  const session = await auth.getSession(req);
  if (!session) return undefined;
  const wu = waitUntil ? { waitUntil } : {};
  const role = await auth.getUserRole(session.user.id);
  const staff = role && STAFF_ROLE_SET.has(role)
    ? { id: session.user.id, role: role as StaffRole }
    : null;
  return { user: { id: session.user.id }, staff, env: {}, ...wu };
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

async function runUseCase<T>(opPath: string, fn: () => Promise<T>): Promise<Response> {
  try {
    const result = await fn();
    return jsonResponse(200, result);
  } catch (e) {
    if (e instanceof DiagnosticError) {
      const status = HTTP_STATUS_BY_CODE[e.diagnostic.code] ?? 500;
      return jsonResponse(status, { ok: false, diagnostic: redactForWire(e.diagnostic) });
    }
    // Don't leak raw exception strings on the wire — R2 / D1 / aws4fetch
    // errors can carry bucket names, account IDs, or query fragments.
    console.error(`[runUseCase ${opPath}] unhandled error`, e);
    return jsonResponse(500, {
      ok: false,
      diagnostic: runtimeDiagnostic({
        code: "INTERNAL_ERROR",
        severity: "error",
        path: opPath,
        message: "An internal error occurred.",
      }),
    });
  }
}

function mediaNotConfiguredResponse(path: string): Response {
  return jsonResponse(501, {
    ok: false,
    diagnostic: runtimeDiagnostic({
      code: "MEDIA_NOT_CONFIGURED",
      severity: "error",
      path,
      message:
        "Media uploads are not enabled on this deployment. Bind a `mediaStorage` adapter in `createCmsRuntime` to enable.",
    }),
  });
}

export type { CmsRuntimeRef };

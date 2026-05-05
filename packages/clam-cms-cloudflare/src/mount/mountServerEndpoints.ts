import type { Context, Hono } from "hono";
import {
  HTTP_STATUS_BY_CODE,
  VIEW_PARAMS_RESERVED,
  runtimeDiagnostic,
  type Diagnostic,
} from "@aotterclam/clam-cms-spec";
import {
  ViewParamCoercionError,
  coerceViewParams,
  matchPath,
  type CmsRuntime,
  type HandlerContext,
} from "@aotterclam/clam-cms-runtime";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

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
      return handleHttpTrigger(c.req.raw, runtime, triggerName, path, waitUntil);
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
}

async function handleHttpTrigger(
  req: Request,
  runtime: CmsRuntime,
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

  const ctx: HandlerContext = await buildHandlerContext(req, runtime, waitUntil);

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
  waitUntil: ((p: Promise<unknown>) => void) | undefined,
): Promise<HandlerContext> {
  const identity = await runtime.oauth.verifyAccessToken(req);
  const user = identity ? { id: identity.userId } : null;
  return { user, staff: null, env: {}, ...(waitUntil ? { waitUntil } : {}) };
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

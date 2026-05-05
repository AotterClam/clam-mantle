import type { Context, Hono } from "hono";
import {
  HTTP_STATUS_BY_CODE,
  runtimeDiagnostic,
  type Diagnostic,
  type JsonSchema,
  type ViewManifest,
} from "@aotter/mantle-spec";
import {
  matchPath,
  type CmsRuntime,
  type HandlerContext,
} from "@aotter/mantle-runtime";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

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
 * Boot caching is poison-isolate-resistant via `createCmsRef`. First
 * request triggers `bootInit`; subsequent requests reuse the cached
 * runtime; transient boot failures clear the cache so the next
 * request retries.
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
  // Per ADR-0012, every parsed View auto-exposes a public read endpoint
  // at `GET /api/views/<name>`. Pagination knobs `page` / `show` are
  // reserved query-string names; remaining params are coerced against
  // `View.spec.params` (declared scalar JSON Schema; required entries
  // enforced at parse time).
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

  const page = parsePagination(url.searchParams.get("page"));
  const show = parsePagination(url.searchParams.get("show"));

  let params: Record<string, unknown>;
  try {
    params = coerceViewParams(view, url.searchParams);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse(400, {
      ok: false,
      diagnostic: runtimeDiagnostic({
        code: "INPUT_VALIDATION_FAILED",
        severity: "error",
        path: viewPath,
        expected: "query string conforms to View.spec.params",
        message,
      }),
    });
  }

  const result = await runtime.executeView.execute({
    view,
    params,
    page,
    show,
    pathPrefix: viewPath,
  });

  if (result.ok) {
    return jsonResponse(200, { ok: true, data: result.result });
  }
  const status = HTTP_STATUS_BY_CODE[result.diagnostic.code] ?? 500;
  return jsonResponse(status, { ok: false, diagnostic: result.diagnostic });
}

function parsePagination(raw: string | null): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Coerce + validate the public query string against `View.spec.params`.
 * v0.1 grammar covers scalar leaf types (string / integer / number /
 * boolean), with `required` enforced. Unknown query keys are silently
 * ignored (lenient v0.1.0; strict mode is a v0.1.x option). Throws
 * with a human-readable message on missing-required or coercion error.
 */
function coerceViewParams(
  view: ViewManifest,
  query: URLSearchParams,
): Record<string, unknown> {
  const declared = view.spec.params;
  if (!declared) return {};
  const props = declared.properties ?? {};
  const required = declared.required ?? [];
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(props) as Array<[string, JsonSchema]>) {
    const raw = query.get(name);
    if (raw == null) {
      if (required.includes(name)) {
        throw new Error(
          `View '${view.metadata.name}' requires query param '${name}' (declared in View.spec.params.required).`,
        );
      }
      continue;
    }
    out[name] = coerceScalar(raw, schema, name);
  }
  return out;
}

function coerceScalar(raw: string, schema: JsonSchema, name: string): unknown {
  const type = schema.type;
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (!schema.enum.includes(raw)) {
      throw new Error(
        `query param '${name}' must be one of ${schema.enum.join(", ")}; got ${JSON.stringify(raw)}.`,
      );
    }
    return raw;
  }
  switch (type) {
    case "integer": {
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n) || String(n) !== raw.trim()) {
        throw new Error(`query param '${name}' expected integer; got ${JSON.stringify(raw)}.`);
      }
      return n;
    }
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        throw new Error(`query param '${name}' expected number; got ${JSON.stringify(raw)}.`);
      }
      return n;
    }
    case "boolean": {
      if (raw === "true") return true;
      if (raw === "false") return false;
      throw new Error(`query param '${name}' expected boolean (true|false); got ${JSON.stringify(raw)}.`);
    }
    case "string":
    case undefined:
      return raw;
    default:
      throw new Error(
        `View param '${name}' declares unsupported type '${String(type)}' for the public REST surface (v0.1 covers string / integer / number / boolean / enum).`,
      );
  }
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

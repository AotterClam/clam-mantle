import type { Hono } from "hono";
import {
  HTTP_STATUS_BY_CODE,
  type Diagnostic,
} from "@aotter/mantle-spec";
import {
  matchPath,
  type CmsRuntime,
  type HandlerContext,
} from "@aotter/mantle-runtime";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";
import type { CmsConfig } from "./cmsConfig.js";

/**
 * Mount the http Triggers in `config.manifests` onto the consumer's
 * Hono app. Each Trigger with `source.kind: 'http'` gets a route at
 * `(method, path)`; the handler resolves the target Procedure,
 * extracts auth context, calls `runtime.invokeProcedure.execute`,
 * and maps the structured response onto an HTTP envelope:
 *
 *   - `{ ok: true }` → 200 JSON `data`
 *   - `{ ok: false, diagnostic }` → status from `HTTP_STATUS_BY_CODE`
 *      (default 500), JSON body `{ diagnostic }`
 *
 * Path params `{name}` from the Trigger path bind to identically-named
 * fields on the Procedure input — POC ADR-0001 grammar.
 *
 * Boot caching is poison-isolate-resistant (POC PR #29 carry-forward)
 * via `createCmsRef`. First request triggers `bootInit`; subsequent
 * requests reuse the cached runtime; transient boot failures clear the
 * cache so the next request retries.
 */
export function mountServerEndpoints(
  app: Hono,
  ref: CmsRuntimeRef,
  manifests: CmsConfig["manifests"],
): void {
  for (const t of manifests) {
    if (t.kind !== "Trigger") continue;
    const source = t.spec.source;
    if (source.kind !== "http") continue;
    const { method, path } = source;
    const honoMethod = method.toLowerCase() as Lowercase<typeof method>;
    const honoPath = openApiToHono(path);
    const triggerName = t.metadata.name;
    app[honoMethod](honoPath, async (c) => {
      const runtime = await ref.get();
      return handleHttpTrigger(c.req.raw, runtime, triggerName, path);
    });
  }
}

async function handleHttpTrigger(
  req: Request,
  runtime: CmsRuntime,
  triggerName: string,
  triggerPath: string,
): Promise<Response> {
  const trigger = runtime.triggers.find((t) => t.metadata.name === triggerName);
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
  const input = { ...params, ...body };

  const ctx: HandlerContext = await buildHandlerContext(req, runtime);

  const result = await runtime.invokeProcedure.execute({
    procedure,
    input,
    ctx,
    pathPrefix: `${req.method} ${triggerPath}`,
  });

  if (result.ok) {
    return new Response(JSON.stringify({ data: result.data }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  const status = HTTP_STATUS_BY_CODE[result.diagnostic.code] ?? 500;
  return new Response(JSON.stringify({ diagnostic: result.diagnostic }), {
    status,
    headers: { "content-type": "application/json" },
  });
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

async function buildHandlerContext(req: Request, runtime: CmsRuntime): Promise<HandlerContext> {
  const identity = await runtime.oauth.verifyAccessToken(req);
  if (!identity) return { user: null, staff: null, env: {} };
  return { user: { id: identity.userId }, staff: null, env: {} };
}

function openApiToHono(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function jsonError(args: { status: number; code: string; message: string }): Response {
  const diagnostic: Partial<Diagnostic> = {
    code: args.code as Diagnostic["code"],
    severity: "error",
    phase: "runtime",
    path: "mount/http",
    message: args.message,
  };
  return new Response(JSON.stringify({ diagnostic }), {
    status: args.status,
    headers: { "content-type": "application/json" },
  });
}

export type { CmsRuntimeRef };

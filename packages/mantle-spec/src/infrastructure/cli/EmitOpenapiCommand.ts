import { stdout, stderr } from "node:process";
import { partitionManifests } from "../../domain/service/ManifestParser.js";
import type {
  ProcedureManifest,
  TriggerManifest,
  ViewManifest,
} from "../../domain/model/ManifestGrammar.js";
import { loadManifestsFromRoot } from "./loadManifests.js";

/**
 * `mantle emit-openapi` — emit OpenAPI 3.1 spec from manifests.
 *
 * Covers two surfaces:
 *   - HTTP Triggers (POST/PUT/PATCH/DELETE), input → requestBody,
 *     output → 200 response. Path params declared via OpenAPI `{name}`
 *     syntax that already matches Trigger.spec.source.path.
 *   - View REST (GET /api/views/<name>), spec.params → query
 *     parameters, envelope { ok, data: { rows, page, show, hasMore } }
 *     → 200 response.
 *
 * MCP is intentionally out of scope (its own protocol surface; not
 * REST). Auth requirements surface as `security` blocks when a
 * Procedure's `requires.auth.all` is non-empty.
 */
export interface EmitOpenapiArgs {
  readonly manifests: string;
  readonly title: string;
  readonly version: string;
}

export type ParseResult = { kind: "args"; args: EmitOpenapiArgs } | { kind: "help" };

export function parseArgs(rawArgs: ReadonlyArray<string>): ParseResult {
  let manifests = "./manifests";
  let title = "mantle";
  let version = "0.1.0";
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === "--manifests") manifests = rawArgs[++i] ?? manifests;
    else if (a === "--title") title = rawArgs[++i] ?? title;
    else if (a === "--version") version = rawArgs[++i] ?? version;
    else if (a === "--help" || a === "-h") return { kind: "help" };
    else if (a !== undefined) {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { kind: "args", args: { manifests, title, version } };
}

function printHelp(): void {
  stdout.write(`mantle emit-openapi — emit OpenAPI 3.1 from manifests

Usage: mantle emit-openapi [options] > openapi.json

Options:
  --manifests <dir>   Manifest root (default: ./manifests)
  --title <str>       OpenAPI info.title (default: mantle)
  --version <str>     OpenAPI info.version (default: 0.1.0)
  -h, --help          This help

Output: OpenAPI 3.1 JSON on stdout.

Covers HTTP Triggers (POST/PUT/PATCH/DELETE) and View REST routes
(GET /api/views/<name>). MCP is out of scope.
`);
}

export async function run(rawArgs: ReadonlyArray<string>): Promise<number> {
  let parsed: ParseResult;
  try {
    parsed = parseArgs(rawArgs);
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  if (parsed.kind === "help") {
    printHelp();
    return 0;
  }
  const args = parsed.args;
  const { manifests, parseErrors } = await loadManifestsFromRoot(args.manifests);
  if (parseErrors.some((d) => d.severity === "error")) {
    stderr.write(`Manifest parse errors — run \`mantle validate\` to inspect.\n`);
    return 1;
  }
  const { views, procedures, triggers } = partitionManifests(manifests);
  const procByName = new Map(procedures.map((p) => [p.metadata.name, p]));

  const paths: Record<string, Record<string, unknown>> = {};

  for (const t of triggers) {
    const src = t.spec.source;
    if (src.kind !== "http") continue;
    const proc = procByName.get(t.spec.target.procedure);
    if (!proc) continue;
    const path = src.path;
    paths[path] ??= {};
    paths[path]![src.method.toLowerCase()] = httpOperation(t, proc);
  }

  for (const v of views) {
    const path = `/api/views/${v.metadata.name}`;
    paths[path] ??= {};
    paths[path]!["get"] = viewOperation(v);
  }

  const spec = {
    openapi: "3.1.0",
    info: { title: args.title, version: args.version },
    paths,
    components: {
      schemas: {
        Diagnostic: diagnosticSchema(),
        ErrorEnvelope: {
          type: "object",
          required: ["ok", "diagnostic"],
          properties: { ok: { const: false }, diagnostic: { $ref: "#/components/schemas/Diagnostic" } },
        },
      },
      securitySchemes: {
        bearer: { type: "http", scheme: "bearer" },
      },
    },
  };

  stdout.write(JSON.stringify(spec, null, 2) + "\n");
  return 0;
}

function httpOperation(t: TriggerManifest, p: ProcedureManifest): Record<string, unknown> {
  // Caller (run) only invokes httpOperation when source.kind === "http",
  // so the narrowing here is safe.
  const method = t.spec.source.kind === "http" ? t.spec.source.method : "POST";
  const op: Record<string, unknown> = {
    operationId: `${method.toLowerCase()}_${p.metadata.name.replace(/[^a-z0-9]+/gi, "_")}`,
    summary: `Trigger ${t.metadata.name}`,
    requestBody: {
      required: true,
      content: { "application/json": { schema: p.spec.input } },
    },
    responses: {
      "200": {
        description: "Procedure result",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ok", "data"],
              properties: { ok: { const: true }, data: p.spec.output },
            },
          },
        },
      },
      default: {
        description: "Error envelope",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
      },
    },
  };
  if (p.spec.requires?.auth?.all && p.spec.requires.auth.all.length > 0) {
    op["security"] = [{ bearer: [] }];
  }
  return op;
}

function viewOperation(v: ViewManifest): Record<string, unknown> {
  const params: Array<Record<string, unknown>> = [
    { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, required: false },
    { name: "show", in: "query", schema: { type: "integer", minimum: 1 }, required: false },
  ];
  if (v.spec.params?.properties) {
    const required = new Set(v.spec.params.required ?? []);
    for (const [name, schema] of Object.entries(v.spec.params.properties)) {
      params.push({
        name,
        in: "query",
        required: required.has(name),
        schema,
      });
    }
  }
  return {
    operationId: `view_${v.metadata.name.replace(/[^a-z0-9]+/gi, "_")}`,
    summary: `View ${v.metadata.name}`,
    parameters: params,
    responses: {
      "200": {
        description: "View result",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["ok", "data"],
              properties: {
                ok: { const: true },
                data: {
                  type: "object",
                  required: ["rows", "page", "show", "hasMore"],
                  properties: {
                    rows: { type: "array", items: { type: "object", additionalProperties: true } },
                    page: { type: "integer" },
                    show: { type: "integer" },
                    hasMore: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
      "400": {
        description: "Invalid query parameter",
        content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorEnvelope" } } },
      },
    },
  };
}

function diagnosticSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["code", "phase", "severity", "path", "message"],
    properties: {
      code: { type: "string" },
      phase: { type: "string", enum: ["validate", "test", "boot", "runtime"] },
      severity: { type: "string", enum: ["error", "warning"] },
      path: { type: "string" },
      message: { type: "string" },
      value: {},
      expected: { type: "string" },
      suggestion: { type: "string" },
    },
  };
}

import { partitionManifests } from "../domain/service/ManifestParser.js";
import type {
  ProcedureManifest,
  TriggerManifest,
  ViewManifest,
} from "../domain/model/ManifestGrammar.js";
import type { EmitOpenapiRequest } from "./dto/EmitOpenapiRequest.js";
import type { EmitOpenapiResponse } from "./dto/EmitOpenapiResponse.js";

/**
 * Build OpenAPI 3.1 from the v0.1 grammar. Two surfaces covered:
 * HTTP Triggers (POST/PUT/PATCH/DELETE) and View REST routes
 * (GET /api/views/<name>). MCP is out of scope (own protocol).
 *
 * Pure: no I/O. CLI adapter handles file load + stdout.
 */
export class EmitOpenapiUseCase {
  execute(request: EmitOpenapiRequest): EmitOpenapiResponse {
    const { views, procedures, triggers } = partitionManifests(request.manifests);
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

    return {
      document: {
        openapi: "3.1.0",
        info: { title: request.title, version: request.version },
        paths,
        components: {
          schemas: {
            Diagnostic: diagnosticSchema(),
            ErrorEnvelope: {
              type: "object",
              required: ["ok", "diagnostic"],
              properties: {
                ok: { const: false },
                diagnostic: { $ref: "#/components/schemas/Diagnostic" },
              },
            },
          },
          securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
        },
      },
    };
  }

  static run(request: EmitOpenapiRequest): EmitOpenapiResponse {
    return new EmitOpenapiUseCase().execute(request);
  }
}

function httpOperation(t: TriggerManifest, p: ProcedureManifest): Record<string, unknown> {
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
      params.push({ name, in: "query", required: required.has(name), schema });
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
                    rows: {
                      type: "array",
                      items: { type: "object", additionalProperties: true },
                    },
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

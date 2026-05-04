import {
  DiagnosticError,
  redactForWire,
  type ContentState,
} from "@aotter/mantle-spec";
import {
  ArchiveUseCase,
  CreateDraftUseCase,
  DeleteEntryUseCase,
  GetEntryUseCase,
  ListEntriesUseCase,
  RequestPublishUseCase,
  UnpublishUseCase,
  UpdateDraftUseCase,
} from "../../usecase/content/index.js";
import { STATIC_TOOLS_WIRE_JSON } from "./McpToolCatalog.js";
import {
  jsonRpcError,
  jsonRpcOk,
  jsonRpcOkRaw,
} from "./McpResponses.js";

/**
 * `McpJsonRpcDispatcher` — JSON-RPC dispatcher for the MCP transport.
 * Env-agnostic — the adapter resolves the caller's identity via
 * `OAuthVerifier.verifyAccessToken` and hands `dispatch` a
 * `McpAuthContext` plus the use-case bag.
 *
 * v0.1.0 surfaces a static tool catalog (`STATIC_TOOLS_WIRE_JSON`).
 * Per-collection tools land in v0.1.x.
 *
 * Thin adapter per the clean-arch rule — JSON-RPC envelope handling
 * only, no business logic.
 */
export interface McpAuthContext {
  readonly userId: string;
}

/**
 * The use-case bag the dispatcher needs. Adapter constructs this once
 * per isolate from the runtime's pre-built use cases (the runtime's
 * assembly root assembles these alongside everything else).
 */
export interface McpUseCases {
  readonly listEntries: ListEntriesUseCase;
  readonly getEntry: GetEntryUseCase;
  readonly createDraft: CreateDraftUseCase;
  readonly updateDraft: UpdateDraftUseCase;
  readonly requestPublish: RequestPublishUseCase;
  readonly unpublish: UnpublishUseCase;
  readonly archive: ArchiveUseCase;
  readonly deleteEntry: DeleteEntryUseCase;
}

export class McpJsonRpcDispatcher {
  constructor(private readonly useCases: McpUseCases) {}

  async dispatch(req: Request, auth: McpAuthContext): Promise<Response> {
    if (req.method === "GET") {
      return new Response("MCP endpoint — POST JSON-RPC here.", { status: 200 });
    }
    if (req.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }

    let body: { id?: number | string | null; method?: string; params?: unknown };
    try {
      body = (await req.json()) as typeof body;
    } catch {
      return jsonRpcError(null, -32700, "parse error");
    }
    const { id = null, method, params } = body;

    switch (method) {
      case "initialize":
        return jsonRpcOk(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "@aotter/mantle-runtime/mcp", version: "0.0.0" },
        });
      case "tools/list":
        return jsonRpcOkRaw(id, `{"tools":${STATIC_TOOLS_WIRE_JSON}}`);
      case "tools/call":
        return this.handleToolCall(id, params, auth);
      default:
        return jsonRpcError(id, -32601, `unknown method: ${method}`);
    }
  }

  private async handleToolCall(
    reqId: unknown,
    params: unknown,
    auth: McpAuthContext,
  ): Promise<Response> {
    const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    if (!p || typeof p.name !== "string") {
      return jsonRpcError(reqId, -32602, "missing tool name");
    }
    const args = (p.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await this.dispatchToolByName(p.name, args, auth);
      if (result === UNKNOWN_TOOL) {
        return jsonRpcError(reqId, -32601, `unknown tool: ${p.name}`);
      }
      if (result === MISSING_ARG) {
        return jsonRpcError(reqId, -32602, "missing required arg");
      }
      return jsonRpcOk(reqId, {
        content: [{ type: "text", text: JSON.stringify(result) }],
      });
    } catch (e) {
      if (e instanceof DiagnosticError) {
        return jsonRpcError(reqId, -32000, e.diagnostic.message, redactForWire(e.diagnostic));
      }
      return jsonRpcError(reqId, -32000, (e as Error).message);
    }
  }

  private async dispatchToolByName(
    name: string,
    args: Record<string, unknown>,
    auth: McpAuthContext,
  ): Promise<unknown | typeof UNKNOWN_TOOL | typeof MISSING_ARG> {
    switch (name) {
      case "list_entries": {
        const collection = args["collection"];
        if (typeof collection !== "string") return MISSING_ARG;
        return this.useCases.listEntries.execute({
          collection,
          status: args["status"] as ContentState | undefined,
          limit: typeof args["limit"] === "number" ? args["limit"] : undefined,
        });
      }
      case "get_entry": {
        const id = args["id"];
        if (typeof id !== "string") return MISSING_ARG;
        return this.useCases.getEntry.execute({ id });
      }
      case "create_draft": {
        const collection = args["collection"];
        const data = args["data"];
        if (typeof collection !== "string" || !isPlainObject(data)) return MISSING_ARG;
        return this.useCases.createDraft.execute({
          collection,
          data,
          authorId: auth.userId,
        });
      }
      case "update_draft": {
        const id = args["id"];
        const expected = args["expected_version"];
        const data = args["data"];
        if (typeof id !== "string" || typeof expected !== "number" || !isPlainObject(data)) {
          return MISSING_ARG;
        }
        return this.useCases.updateDraft.execute({
          id,
          expectedVersion: expected,
          data,
        });
      }
      case "request_publish": {
        const id = args["id"];
        if (typeof id !== "string") return MISSING_ARG;
        return this.useCases.requestPublish.execute({ id });
      }
      case "archive_entry": {
        const id = args["id"];
        const expected = args["expected_version"];
        if (typeof id !== "string" || typeof expected !== "number") return MISSING_ARG;
        return this.useCases.archive.execute({ id, expectedVersion: expected });
      }
      default:
        return UNKNOWN_TOOL;
    }
  }
}

const UNKNOWN_TOOL = Symbol("unknown-tool");
const MISSING_ARG = Symbol("missing-arg");

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

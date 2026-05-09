import {
  DiagnosticError,
  redactForWire,
  type ContentState,
  type SchemaManifest,
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
import {
  CommitMediaUploadUseCase,
  CreateMediaUploadUseCase,
} from "../../usecase/media/index.js";
import { mcpToolNameSegment } from "../../domain/service/McpToolNaming.js";
import {
  CREATE_DRAFT_PREFIX,
  UPDATE_DRAFT_PREFIX,
  buildMcpToolCatalog,
  extractCollectionSegment,
  type McpToolDefinition,
} from "./McpToolCatalog.js";
import {
  jsonRpcError,
  jsonRpcOk,
  jsonRpcOkRaw,
} from "./McpResponses.js";
import type { Staff } from "../../domain/model/Staff.js";

/**
 * `McpJsonRpcDispatcher` — JSON-RPC dispatcher for the MCP transport.
 * Env-agnostic — the adapter resolves the caller's identity via
 * `OAuthVerifier.verifyAccessToken` and hands `dispatch` a
 * `McpAuthContext` plus the use-case bag.
 *
 * v0.1.0 surfaces a per-collection authoring catalog
 * (`create_draft_<collection>`, `update_draft_<collection>` for each
 * Schema in the manifest set, with the Schema's properties inlined
 * into the tool's `inputSchema`) plus generic read/status tools
 * (`list_entries`, `get_entry`, `request_publish`, `unpublish_entry`,
 * `archive_entry`).
 * Boot validation refuses Schemas whose names mangle to the same
 * tool-name suffix.
 *
 * Thin adapter per the clean-arch rule — JSON-RPC envelope handling
 * only, no business logic.
 */
export interface McpAuthContext {
  readonly userId: string;
  /** Resolved staff row for the authenticated user. Null when the user
   *  is not staff (e.g. a service-account token with no staff row). */
  readonly staff: Staff | null;
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
  /** Optional. When set, `create_media_upload` and `commit_media_upload`
   *  appear in the catalog and route here. */
  readonly media?: {
    readonly createUpload: CreateMediaUploadUseCase;
    readonly commitUpload: CommitMediaUploadUseCase;
  };
}

export class McpJsonRpcDispatcher {
  private readonly catalog: readonly McpToolDefinition[];
  private readonly catalogWireJson: string;
  /** segment → original `Schema.metadata.name`. Built once at
   *  construction; the per-collection routing path looks up the
   *  segment from the tool name and recovers the canonical
   *  collection name. */
  private readonly schemaBySegment: ReadonlyMap<string, string>;

  constructor(
    private readonly useCases: McpUseCases,
    private readonly schemas: ReadonlyArray<SchemaManifest>,
  ) {
    this.catalog = buildMcpToolCatalog(schemas, {
      mediaEnabled: useCases.media !== undefined,
    });
    this.catalogWireJson = `{"tools":${JSON.stringify(this.catalog)}}`;
    const map = new Map<string, string>();
    for (const s of schemas) map.set(mcpToolNameSegment(s.metadata.name), s.metadata.name);
    this.schemaBySegment = map;
  }

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
          serverInfo: { name: "@aotter/mantle-runtime/mcp", version: "0.0.6-alpha" },
        });
      case "tools/list":
        return jsonRpcOkRaw(id, this.catalogWireJson);
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
      // Don't leak raw exception strings to MCP clients — adapter
      // exceptions can carry binding / driver detail. Real cause goes
      // to server-side logs; the wire stays opaque.
      console.error("[McpJsonRpcDispatcher] unhandled tool-call error", e);
      return jsonRpcError(reqId, -32000, "Internal error.");
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
      case "request_publish": {
        const id = args["id"];
        if (typeof id !== "string") return MISSING_ARG;
        return this.useCases.requestPublish.execute({ id });
      }
      case "unpublish_entry": {
        const id = args["id"];
        if (typeof id !== "string") return MISSING_ARG;
        return this.useCases.unpublish.execute({ id });
      }
      case "archive_entry": {
        const id = args["id"];
        const expected = args["expected_version"];
        if (typeof id !== "string" || typeof expected !== "number") return MISSING_ARG;
        return this.useCases.archive.execute({ id, expectedVersion: expected });
      }
      case "create_media_upload": {
        if (!this.useCases.media) return UNKNOWN_TOOL;
        const filename = args["filename"];
        const mimeType = args["mimeType"];
        if (typeof filename !== "string" || typeof mimeType !== "string") return MISSING_ARG;
        return this.useCases.media.createUpload.execute({
          filename,
          mimeType,
          byteSize: typeof args["byteSize"] === "number" ? args["byteSize"] : undefined,
          alt: typeof args["alt"] === "string" ? args["alt"] : undefined,
          caption: typeof args["caption"] === "string" ? args["caption"] : undefined,
          purpose: typeof args["purpose"] === "string" ? args["purpose"] : undefined,
        });
      }
      case "commit_media_upload": {
        if (!this.useCases.media) return UNKNOWN_TOOL;
        const uploadId = args["uploadId"];
        if (typeof uploadId !== "string") return MISSING_ARG;
        return this.useCases.media.commitUpload.execute({
          uploadId,
          alt: typeof args["alt"] === "string" ? args["alt"] : undefined,
          caption: typeof args["caption"] === "string" ? args["caption"] : undefined,
          checksum: typeof args["checksum"] === "string" ? args["checksum"] : undefined,
        });
      }
      default: {
        // Per-collection authoring tools: `create_draft_<segment>` /
        // `update_draft_<segment>`. The agent sends Schema fields at
        // the top level; we rebuild `data` for the chokepoint.
        // `hookCtx` plumbs the authenticated MCP user into lifecycle
        // hook context so consumers can branch on `ctx.user` (e.g.
        // bypass captcha checks for authenticated agents).
        const hookCtx = {
          user: { id: auth.userId },
          staff: auth.staff ? { id: auth.staff.userId, role: auth.staff.role } : null,
          env: {},
        };
        const createSegment = extractCollectionSegment(name, CREATE_DRAFT_PREFIX);
        if (createSegment) {
          const collection = this.schemaBySegment.get(createSegment);
          if (!collection) return UNKNOWN_TOOL;
          return this.useCases.createDraft.execute({
            collection,
            data: stripReservedArgs(args),
            authorId: auth.userId,
            ctx: hookCtx,
          });
        }
        const updateSegment = extractCollectionSegment(name, UPDATE_DRAFT_PREFIX);
        if (updateSegment) {
          const collection = this.schemaBySegment.get(updateSegment);
          if (!collection) return UNKNOWN_TOOL;
          const id = args["id"];
          const expected = args["expected_version"];
          if (typeof id !== "string" || typeof expected !== "number") return MISSING_ARG;
          // Caller may also call get_entry separately; we don't need
          // the collection on the chokepoint args because UpdateDraft
          // looks it up from the existing row.
          return this.useCases.updateDraft.execute({
            id,
            expectedVersion: expected,
            data: stripReservedArgs(args),
            ctx: hookCtx,
          });
        }
        return UNKNOWN_TOOL;
      }
    }
  }
}

const UNKNOWN_TOOL = Symbol("unknown-tool");
const MISSING_ARG = Symbol("missing-arg");

/**
 * Strip the `id` + `expected_version` envelope keys before passing
 * the rest to the chokepoint as `data`. Per-collection update tools
 * mix routing keys (id, expected_version) with authoring fields at
 * the same level; this re-separates them.
 */
const RESERVED_ARG_KEYS: readonly string[] = ["id", "expected_version"];
function stripReservedArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (RESERVED_ARG_KEYS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

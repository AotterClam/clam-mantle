import {
  MANTLE_BIND_KEYWORD,
  expandPolicyRequired,
  type MediaPurposePolicy,
  type SchemaManifest,
  type ViewManifest,
} from "@aotter/mantle-spec";
import { mcpToolNameSegment } from "../../domain/service/McpToolNaming.js";

/**
 * MCP tool catalog. Mix of generic tools (read paths, status flips
 * that take only an `id`) plus per-collection emitted authoring
 * tools (`create_draft_<collection>`, `update_draft_<collection>`)
 * with the Schema's properties inlined into the tool's `inputSchema`
 * so MCP clients (LLM agents) see typed authoring contracts without
 * a separate `get_schema` round trip.
 *
 * Per-collection emission rules (POC ADR-0014 + PR #48 collision fix):
 *
 *   - tool name suffix = `Schema.metadata.name` lowercased + `kebab-`
 *     to-`snake_` (`post-translations` → `post_translations`)
 *   - input schema = `Schema.spec.schema.properties` minus any
 *     property carrying `x-mantle-bind` (those are server-stamped and
 *     the agent must not send them)
 *   - `required` = intersection of `Schema.spec.schema.required` with
 *     the surviving authoring fields
 *   - `update_draft_<collection>` adds `id` + `expected_version` to
 *     the schema and to `required`
 *   - the dispatcher unwraps the typed top-level fields back into the
 *     chokepoint's `data` arg — the wire surface is flatter than
 *     `{ data: {...} }`, the storage shape is unchanged.
 *
 * Two Schemas that mangle to the same tool-name suffix (`foo-bar` and
 * `foo_bar` both → `foo_bar`) are caught at boot with
 * `MCP_TOOL_NAME_COLLISION`.
 */
export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export const COMMIT_MEDIA_UPLOAD_TOOL: McpToolDefinition = {
  name: "commit_media_upload",
  description:
    "Commit a previously-PUT variant bundle. Verifies every variant landed at the storage backend (HEAD + bytes per declared mime) and writes the committed MediaAsset to the media_assets table. Returns the asset with its variants populated. Only registered when the runtime has a media storage adapter bound and a media.purposes taxonomy declared.",
  inputSchema: {
    type: "object",
    properties: {
      uploadGroupId: {
        type: "string",
        description:
          "Logical asset id returned by create_media_upload as `uploadGroupId`; passed verbatim to commit.",
      },
      alt: { type: "string" },
      caption: { type: "string" },
    },
    required: ["uploadGroupId"],
  },
};

function buildMediaTools(
  mediaPurposes: readonly MediaPurposePolicy[],
): readonly McpToolDefinition[] {
  return [buildCreateMediaUploadTool(mediaPurposes), COMMIT_MEDIA_UPLOAD_TOOL];
}

function buildCreateMediaUploadTool(
  mediaPurposes: readonly MediaPurposePolicy[] = [],
): McpToolDefinition {
  const purpose: Record<string, unknown> = {
    type: "string",
    description:
      "Required purpose tag declared by this starter. Determines the required variant mime set + per-mime byte caps.",
  };
  if (mediaPurposes.length > 0) purpose["enum"] = mediaPurposes.map((p) => p.name);

  const policySummary =
    mediaPurposes.length > 0
      ? "Purpose policies in this deployment:\n" +
        mediaPurposes
          .map((p) => {
            const slots = expandPolicyRequired(p.required)
              .map(
                (mimes, i) =>
                  `slot ${i}: ${
                    mimes.length > 1
                      ? `one of [${mimes.join(", ")}]`
                      : mimes[0]
                  }`,
              )
              .join("; ");
            const caps = Object.entries(p.maxBytes)
              .map(([m, b]) => `${m}=${b}`)
              .join(", ");
            return `  • ${p.name} — ${slots}; maxBytes: ${caps}`;
          })
          .join("\n")
      : "";

  return {
    name: "create_media_upload",
    description:
      "Issue short-lived direct-upload capabilities for every variant of one logical media asset. " +
      "Multi-variant by default (#272): one call yields N presigned PUTs (one per declared slot). " +
      "Per-asset, the agent picks ONE mime per slot from that slot's acceptable set (#282); a " +
      "single purpose declared with slot 0 = `image/jpg,image/png` accepts either a jpeg primary " +
      "(photos) or a png primary (logos / transparent assets). Optimization runs agent-side via " +
      "@aotter/mantle-media-tools; the Worker only verifies policy. After uploading every variant, " +
      "call commit_media_upload with the returned uploadGroupId. Only registered when the runtime " +
      "has a media storage adapter bound and a media.purposes taxonomy declared." +
      (policySummary ? `\n\n${policySummary}` : ""),
    inputSchema: {
      type: "object",
      properties: {
        filename: {
          type: "string",
          description:
            "Original filename — used in object metadata only; storage keys are server-generated.",
        },
        purpose,
        variants: {
          type: "array",
          minItems: 1,
          description:
            "One entry per format the agent has prepared. Must cover every mime in the purpose's `required` set; one variant must carry role='primary' (the format `<img>` falls back to). Modern formats (avif/webp) MUST NOT exceed the fallback's byteSize — the runtime rejects suspicious sizing.",
          items: {
            type: "object",
            properties: {
              mimeType: {
                type: "string",
                description:
                  "Content-Type. Allowlist: image/png, image/jpeg, image/webp, image/gif, image/avif. SVG only with adapter opt-in.",
              },
              byteSize: {
                type: "number",
                description:
                  "Caller-declared payload size. Verified against the purpose's `maxBytes[mimeType]` before a presigned URL is minted.",
              },
              role: {
                type: "string",
                enum: ["primary", "alternate", "fallback"],
                description:
                  "`primary` is the `<img>` fallback (typically jpeg/png); `alternate` is preferred via `<picture><source>` (avif/webp).",
              },
            },
            required: ["mimeType", "byteSize", "role"],
          },
        },
        alt: { type: "string" },
        caption: { type: "string" },
      },
      required: ["filename", "purpose", "variants"],
    },
  };
}

export const GENERIC_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "list_entries",
    description: "List entries in a collection. Optional filter by status. Result is { rows, nextCursor? }: when `nextCursor` is present, pass it back as `cursor` to fetch the next page. Absent `nextCursor` means this is the last page.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        status: { type: "string", enum: ["draft", "published", "archived"] },
        limit: { type: "number" },
        cursor: { type: "string", description: "Opaque continuation token from a previous list_entries response." },
      },
      required: ["collection"],
    },
  },
  {
    name: "get_entry",
    description: "Fetch a single entry by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "request_publish",
    description: "Publish a draft. v0.1.0 simple lifecycle: publishes immediately.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "unpublish_entry",
    description: "Unpublish a published or archived entry back to draft before editing.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "archive_entry",
    description: "Archive an entry. Requires expected_version (OCC).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        expected_version: { type: "number" },
      },
      required: ["id", "expected_version"],
    },
  },
  {
    name: "delete_entry",
    description: "Permanently delete an entry. Cascades to its revisions and approvals. Prefer archive_entry when reversibility matters.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

export const CREATE_DRAFT_PREFIX = "create_draft_";
export const UPDATE_DRAFT_PREFIX = "update_draft_";
export const QUERY_VIEW_PREFIX = "query_view_";

export type McpToolSurface = "staff" | "public";

/**
 * Build the full tool catalog from the manifest's Schemas. The
 * runtime constructs this once at boot (post-validation) and the
 * dispatcher reads it for `tools/list` + name-based routing.
 */
export interface BuildMcpToolCatalogOpts {
  /** When true, registers `create_media_upload` + `commit_media_upload`.
   *  Adapters set this from the runtime's `media` field (non-null when
   *  a `mediaStorage` was bound). */
  readonly mediaEnabled?: boolean;
  /** Declared `siteDefaults.media.purposes`; when supplied, the
   *  `create_media_upload` schema marks purpose as required and emits
   *  this set as an enum so agents can self-correct from tools/list.
   *  The policy summary (required mimes + per-mime byte caps) is also
   *  inlined into the tool description so agents see the contract
   *  without a separate `get_schema` round trip. */
  readonly mediaPurposes?: readonly MediaPurposePolicy[];
  /** Staff surface exposes authoring / lifecycle tools. Public
   *  surface exposes only read-only View queries for v0.1. */
  readonly surface?: McpToolSurface;
  readonly views?: ReadonlyArray<ViewManifest>;
}

export function buildMcpToolCatalog(
  schemas: ReadonlyArray<SchemaManifest>,
  opts: BuildMcpToolCatalogOpts = {},
): readonly McpToolDefinition[] {
  const surface = opts.surface ?? "staff";
  if (surface === "public") {
    return (opts.views ?? []).map(buildQueryViewTool);
  }
  const out: McpToolDefinition[] = [...GENERIC_TOOLS];
  if (opts.mediaEnabled) out.push(...buildMediaTools(opts.mediaPurposes ?? []));
  for (const s of schemas) {
    out.push(buildCreateTool(s));
    out.push(buildUpdateTool(s));
  }
  return out;
}

/** Re-export the naming util from `domain/service/` so existing
 *  consumers of `McpToolCatalog` (the dispatcher) keep their import
 *  surface stable. */
export { mcpToolNameSegment as toolNameSegment };

/** Inverse routing: given a tool name and its prefix, recover the
 *  segment. Returns `null` if the name doesn't carry the prefix. */
export function extractCollectionSegment(
  toolName: string,
  prefix: string,
): string | null {
  if (!toolName.startsWith(prefix)) return null;
  const segment = toolName.slice(prefix.length);
  return segment.length === 0 ? null : segment;
}

function buildCreateTool(schema: SchemaManifest): McpToolDefinition {
  const { properties, required } = filterAuthoringFields(schema);
  const inputSchema: Record<string, unknown> = {
    type: "object",
    properties,
  };
  if (required.length > 0) inputSchema["required"] = required;
  return {
    name: `${CREATE_DRAFT_PREFIX}${mcpToolNameSegment(schema.metadata.name)}`,
    description: describeCreateTool(schema),
    inputSchema,
  };
}

function buildUpdateTool(schema: SchemaManifest): McpToolDefinition {
  const { properties, required } = filterAuthoringFields(schema);
  const inputSchema: Record<string, unknown> = {
    type: "object",
    properties: {
      id: { type: "string", description: "Entry id to update." },
      expected_version: {
        type: "number",
        description: "OCC version (must match current row version).",
      },
      ...properties,
    },
    required: ["id", "expected_version", ...required],
  };
  return {
    name: `${UPDATE_DRAFT_PREFIX}${mcpToolNameSegment(schema.metadata.name)}`,
    description: describeUpdateTool(schema),
    inputSchema,
  };
}

function buildQueryViewTool(view: ViewManifest): McpToolDefinition {
  const params = view.spec.params as
    | { properties?: Record<string, unknown>; required?: readonly string[] }
    | undefined;
  const properties: Record<string, unknown> = {
    ...(params?.properties ?? {}),
    page: { type: "number", description: "Optional 1-based page number." },
    show: { type: "number", description: "Optional page size, capped by the View limit." },
  };
  const inputSchema: Record<string, unknown> = {
    type: "object",
    properties,
  };
  if (params?.required?.length) inputSchema["required"] = params.required;
  return {
    name: `${QUERY_VIEW_PREFIX}${mcpToolNameSegment(view.metadata.name)}`,
    description: `Query public View '${view.metadata.name}'.`,
    inputSchema,
  };
}

function describeCreateTool(schema: SchemaManifest): string {
  const base = `Create a new draft entry in '${schema.metadata.name}'.`;
  return schema.spec.description ? `${base} ${schema.spec.description}`.trim() : base;
}

function describeUpdateTool(schema: SchemaManifest): string {
  return `Update a draft entry in '${schema.metadata.name}' with optimistic-concurrency check.`;
}

interface AuthoringFields {
  readonly properties: Record<string, unknown>;
  readonly required: readonly string[];
}

/**
 * Strip server-stamped properties (those carrying `x-mantle-bind`) from
 * the Schema's authoring surface. The agent must not send these — the
 * builtin op projection drops them anyway, but exposing them in the
 * tool schema would invite confusion.
 *
 * The remaining `required` is the intersection of the original
 * `required` array and the surviving property keys.
 */
function filterAuthoringFields(schema: SchemaManifest): AuthoringFields {
  const props =
    (schema.spec.schema as { properties?: Record<string, unknown> }).properties ?? {};
  const originalRequired =
    (schema.spec.schema as { required?: readonly string[] }).required ?? [];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, propDef] of Object.entries(props)) {
    if (hasMantleBind(propDef)) continue;
    properties[key] = propDef;
    if (originalRequired.includes(key)) required.push(key);
  }
  return { properties, required };
}

function hasMantleBind(propDef: unknown): boolean {
  if (typeof propDef !== "object" || propDef === null) return false;
  return MANTLE_BIND_KEYWORD in (propDef as Record<string, unknown>);
}

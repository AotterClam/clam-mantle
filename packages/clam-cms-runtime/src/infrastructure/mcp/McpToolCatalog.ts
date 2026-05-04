import {
  CLAM_BIND_KEYWORD,
  type SchemaManifest,
} from "@aotterclam/clam-cms-spec";
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
 *     property carrying `x-clam-bind` (those are server-stamped and
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

export const GENERIC_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "list_entries",
    description: "List entries in a collection. Optional filter by status.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        status: { type: "string", enum: ["draft", "published", "archived"] },
        limit: { type: "number" },
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
];

export const CREATE_DRAFT_PREFIX = "create_draft_";
export const UPDATE_DRAFT_PREFIX = "update_draft_";

/**
 * Build the full tool catalog from the manifest's Schemas. The
 * runtime constructs this once at boot (post-validation) and the
 * dispatcher reads it for `tools/list` + name-based routing.
 */
export function buildMcpToolCatalog(
  schemas: ReadonlyArray<SchemaManifest>,
): readonly McpToolDefinition[] {
  const out: McpToolDefinition[] = [...GENERIC_TOOLS];
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
 * Strip server-stamped properties (those carrying `x-clam-bind`) from
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
    if (hasClamBind(propDef)) continue;
    properties[key] = propDef;
    if (originalRequired.includes(key)) required.push(key);
  }
  return { properties, required };
}

function hasClamBind(propDef: unknown): boolean {
  if (typeof propDef !== "object" || propDef === null) return false;
  return CLAM_BIND_KEYWORD in (propDef as Record<string, unknown>);
}

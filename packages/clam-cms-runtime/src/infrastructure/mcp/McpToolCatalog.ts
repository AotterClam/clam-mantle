/**
 * Static MCP tool catalog for v0.1.0. Per-collection tool emission
 * (`create_draft_<collection>`, `update_draft_<collection>`) is
 * v0.1.x — for now, MCP clients pass `collection` as an argument
 * to the generic tools below.
 *
 * Wire JSON is pre-serialized at module-init so `tools/list`
 * doesn't pay a stringify per request.
 */
export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export const STATIC_TOOLS: readonly McpToolDefinition[] = [
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
    name: "create_draft",
    description: "Create a new draft entry in a collection.",
    inputSchema: {
      type: "object",
      properties: {
        collection: { type: "string" },
        data: { type: "object" },
      },
      required: ["collection", "data"],
    },
  },
  {
    name: "update_draft",
    description: "Update a draft entry's data. Requires expected_version (OCC).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        expected_version: { type: "number" },
        data: { type: "object" },
      },
      required: ["id", "expected_version", "data"],
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

export const STATIC_TOOLS_WIRE_JSON = JSON.stringify(STATIC_TOOLS);

/**
 * `Schema.metadata.name` → MCP per-collection tool name suffix.
 * Lowercase + `kebab-` → `_snake`. Pure naming convention; the MCP
 * tool catalog factory and the boot collision check both reference
 * this so the rule lives in exactly one place.
 *
 * Lives in `domain/service/` (not `infrastructure/mcp/`) so the boot
 * use case can call it without violating the usecase→infrastructure
 * import rule.
 */
export function mcpToolNameSegment(collection: string): string {
  return collection.toLowerCase().replace(/-/g, "_");
}

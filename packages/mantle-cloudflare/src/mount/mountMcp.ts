import type { Hono } from "hono";
import { McpJsonRpcDispatcher } from "@aotter/mantle-runtime";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

/**
 * Mount the MCP `/mcp` endpoint onto the consumer's Hono app. Pass-
 * through to `McpJsonRpcDispatcher` after extracting the bearer-token
 * identity via the runtime's `OAuthVerifier`.
 *
 * Returns 401 with no JSON-RPC envelope when the bearer is missing /
 * invalid — matches MCP spec behavior (transport-level auth failure
 * before JSON-RPC parsing).
 *
 * Path defaults to `/mcp`; consumers can override via the `path`
 * option when their worker hosts multiple MCP surfaces.
 */
export function mountMcp(
  app: Hono,
  ref: CmsRuntimeRef,
  options: { path?: string } = {},
): void {
  const path = options.path ?? "/mcp";
  let dispatcher: McpJsonRpcDispatcher | null = null;
  app.all(path, async (c) => {
    const runtime = await ref.get();
    const identity = await runtime.oauth.verifyAccessToken(c.req.raw);
    if (!identity) {
      return new Response("unauthorized", {
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="mcp"' },
      });
    }
    dispatcher ??= new McpJsonRpcDispatcher(
      {
        listEntries: runtime.listEntries,
        getEntry: runtime.getEntry,
        createDraft: runtime.createDraft,
        updateDraft: runtime.updateDraft,
        requestPublish: runtime.requestPublish,
        unpublish: runtime.unpublish,
        archive: runtime.archive,
        deleteEntry: runtime.deleteEntry,
      },
      [...runtime.schemasByName.values()],
    );
    return dispatcher.dispatch(c.req.raw, { userId: identity.userId });
  });
}

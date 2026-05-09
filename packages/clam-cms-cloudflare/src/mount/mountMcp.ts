import type { Hono } from "hono";
import { McpJsonRpcDispatcher, type Staff } from "@aotterclam/clam-cms-runtime";
import type { StaffRole } from "@aotterclam/clam-cms-spec";
import { ADMIN_ROLES, type Auth } from "../auth/createAuth.js";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(ADMIN_ROLES);

/**
 * Mount MCP `/mcp` (JSON-RPC) on the consumer's Hono app. Validates
 * the bearer via Better Auth's MCP plugin (when `ref.auth` is set) or
 * the legacy `OAuthVerifier` + `StaffRepository` ports (when only
 * `ref.adminAuth` is wired). Returns 401 / 403 at the transport layer
 * — before JSON-RPC parsing — to match MCP spec behavior.
 */
export function mountMcp(
  app: Hono,
  ref: CmsRuntimeRef,
  options: { path?: string } = {},
): void {
  const path = options.path ?? "/mcp";
  let dispatcher: McpJsonRpcDispatcher | null = null;
  const buildDispatcher = (runtime: Awaited<ReturnType<CmsRuntimeRef["get"]>>): McpJsonRpcDispatcher => {
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
    return dispatcher;
  };

  if (ref.auth) {
    const auth = ref.auth;
    app.all(path, async (c) => {
      const session = await auth.getMcpSession(c.req.raw);
      if (!session) {
        return new Response("unauthorized", {
          status: 401,
          headers: { "www-authenticate": 'Bearer realm="mcp"' },
        });
      }
      const role = await auth.getUserRole(session.userId);
      if (!role || !ADMIN_ROLE_SET.has(role)) {
        return new Response("forbidden", {
          status: 403,
          headers: { "www-authenticate": 'Bearer realm="mcp" error="insufficient_scope"' },
        });
      }
      const runtime = await ref.get();
      const staff: Staff = {
        userId: session.userId,
        role: role as StaffRole,
        grantedBy: null,
        grantedAt: 0,
      };
      return buildDispatcher(runtime).dispatch(c.req.raw, { userId: session.userId, staff });
    });
    return;
  }

  app.all(path, async (c) => {
    const runtime = await ref.get();
    const identity = await runtime.oauth.verifyAccessToken(c.req.raw);
    if (!identity) {
      return new Response("unauthorized", {
        status: 401,
        headers: { "www-authenticate": 'Bearer realm="mcp"' },
      });
    }
    const staff = await runtime.staff.readByUserId(identity.userId);
    if (!staff) {
      return new Response("forbidden", {
        status: 403,
        headers: { "www-authenticate": 'Bearer realm="mcp" error="insufficient_scope"' },
      });
    }
    return buildDispatcher(runtime).dispatch(c.req.raw, { userId: identity.userId, staff });
  });
}

import type { Hono } from "hono";
import { McpJsonRpcDispatcher, type Staff } from "@aotterclam/clam-cms-runtime";
import type { StaffRole } from "@aotterclam/clam-cms-spec";
import { ADMIN_ROLE_SET, type Auth } from "../auth/createAuth.js";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

const UNAUTHORIZED: ResponseInit = {
  status: 401,
  headers: { "www-authenticate": 'Bearer realm="mcp"' },
};
const FORBIDDEN: ResponseInit = {
  status: 403,
  headers: { "www-authenticate": 'Bearer realm="mcp" error="insufficient_scope"' },
};

export function mountMcp(
  app: Hono,
  ref: CmsRuntimeRef,
  options: { path?: string } = {},
): void {
  const path = options.path ?? "/mcp";
  let dispatcher: McpJsonRpcDispatcher | null = null;
  const buildDispatcher = (
    runtime: Awaited<ReturnType<CmsRuntimeRef["get"]>>,
  ): McpJsonRpcDispatcher => {
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
      // Boot is independent of auth — fetch concurrently to save one
      // D1 round-trip on the hot path.
      const [session, runtime] = await Promise.all([
        auth.getMcpSession(c.req.raw),
        ref.get(),
      ]);
      if (!session) return new Response("unauthorized", UNAUTHORIZED);
      const role = await auth.getUserRole(session.userId);
      if (!role || !ADMIN_ROLE_SET.has(role)) {
        return new Response("forbidden", FORBIDDEN);
      }
      // Better Auth's tokens carry no grant metadata; the placeholders
      // satisfy the runtime's `Staff` shape but no consumer reads them.
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
    if (!identity) return new Response("unauthorized", UNAUTHORIZED);
    const staff = await runtime.staff.readByUserId(identity.userId);
    if (!staff) return new Response("forbidden", FORBIDDEN);
    return buildDispatcher(runtime).dispatch(c.req.raw, { userId: identity.userId, staff });
  });
}

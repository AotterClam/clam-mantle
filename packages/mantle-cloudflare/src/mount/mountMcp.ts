import type { Hono } from "hono";
import { McpJsonRpcDispatcher } from "@aotter/mantle-runtime";
import type { StaffRole } from "@aotter/mantle-spec";
import { ADMIN_ROLE_SET } from "../auth/createAuth.js";
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
  const auth = ref.auth;
  const path = options.path ?? "/mcp";
  let dispatcher: McpJsonRpcDispatcher | null = null;

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
        media: runtime.media
          ? {
              createUpload: runtime.media.createUpload,
              commitUpload: runtime.media.commitUpload,
            }
          : undefined,
      },
      [...runtime.schemasByName.values()],
    );
    return dispatcher.dispatch(c.req.raw, {
      userId: session.userId,
      staff: { userId: session.userId, role: role as StaffRole },
    });
  });
}

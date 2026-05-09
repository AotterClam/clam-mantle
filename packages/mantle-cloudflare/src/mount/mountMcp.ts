import type { Hono } from "hono";
import { McpJsonRpcDispatcher } from "@aotter/mantle-runtime";
import type { StaffRole, ViewManifest } from "@aotter/mantle-spec";
import { ADMIN_ROLE_SET } from "../auth/createAuth.js";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

export function mountMcp(
  app: Hono,
  ref: CmsRuntimeRef,
  options: {
    path?: string;
    surface?: "staff" | "public";
    requiredScope?: "mcp:staff" | "mcp:read";
  } = {},
): void {
  const auth = ref.auth;
  const path = options.path ?? "/mcp";
  const surface = options.surface ?? "staff";
  const requiredScope = options.requiredScope ?? (surface === "staff" ? "mcp:staff" : "mcp:read");
  let dispatcher: McpJsonRpcDispatcher | null = null;

  app.all(path, async (c) => {
    // Boot is independent of auth — fetch concurrently to save one
    // D1 round-trip on the hot path.
    const [session, runtime] = await Promise.all([
      auth.getMcpSession(c.req.raw),
      ref.get(),
    ]);
    if (!session) return new Response("unauthorized", unauthorized(c.req.url, requiredScope));
    if (!hasRequiredScope(session.scopes, requiredScope)) {
      return new Response("forbidden", forbidden(requiredScope));
    }
    const role = await auth.getUserRole(session.userId);
    if (surface === "staff" && (!role || !ADMIN_ROLE_SET.has(role))) {
      return new Response("forbidden", forbidden(requiredScope));
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
        executeView: runtime.executeView,
        media: runtime.media
          ? {
              createUpload: runtime.media.createUpload,
              commitUpload: runtime.media.commitUpload,
            }
          : undefined,
      },
      [...runtime.schemasByName.values()],
      {
        surface,
        views: ref.manifests.filter((m): m is ViewManifest => m.kind === "View"),
      },
    );
    return dispatcher.dispatch(c.req.raw, {
      userId: session.userId,
      staff: role && ADMIN_ROLE_SET.has(role)
        ? { userId: session.userId, role: role as StaffRole }
        : null,
    });
  });
}

function hasRequiredScope(scopes: readonly string[], required: "mcp:staff" | "mcp:read"): boolean {
  if (scopes.includes(required)) return true;
  return required === "mcp:read" && scopes.includes("mcp:staff");
}

function unauthorized(
  requestUrl: string,
  requiredScope: "mcp:staff" | "mcp:read",
): ResponseInit {
  const url = new URL(requestUrl);
  const metadataPath = "/api/auth/.well-known/oauth-protected-resource";
  return {
    status: 401,
    headers: {
      "www-authenticate": `Bearer realm="mcp", scope="${requiredScope}", resource_metadata="${url.origin}${metadataPath}"`,
      "access-control-expose-headers": "WWW-Authenticate",
    },
  };
}

function forbidden(requiredScope: "mcp:staff" | "mcp:read"): ResponseInit {
  return {
    status: 403,
    headers: {
      "www-authenticate": `Bearer realm="mcp", error="insufficient_scope", scope="${requiredScope}"`,
      "access-control-expose-headers": "WWW-Authenticate",
    },
  };
}

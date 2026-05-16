import { McpJsonRpcDispatcher } from "@aotterclam/mantle-runtime";
import type { StaffRole, ViewManifest } from "@aotterclam/mantle-spec";
import { ADMIN_ROLE_SET } from "../auth/createAuth.js";
import type { OAuthApiProps } from "../oauth/mountOAuth.js";
import type { CmsRuntimeRef } from "./bootRuntimeOnce.js";

/**
 * RFC 9728 §3.1: the OAuth Protected Resource Metadata document for a
 * resource at `<origin><path>` is served at
 * `<origin>/.well-known/oauth-protected-resource<path>`. The OAuth
 * provider lib handles this automatically when it sits at top level
 * (`export default new OAuthProvider(...)`); kept exported for
 * consumers who want to inspect the path shape.
 */
export function protectedResourceMetadataPath(resourcePath: string): string {
  const trimmed = resourcePath.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/.well-known/oauth-protected-resource";
  const normalized = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `/.well-known/oauth-protected-resource${normalized}`;
}

export interface CreateMcpApiHandlerOptions {
  readonly ref: CmsRuntimeRef;
  readonly surface: "staff" | "public";
}

/**
 * Build a Cloudflare Worker `ExportedHandler` that serves one MCP
 * resource path. Plug into `createOAuthProvider({ apiHandlers })`
 * keyed by the resource path (e.g. `/mcp/staff` or `/mcp`).
 *
 * The OAuthProvider lib verifies the bearer token, decrypts grant
 * props, and sets `ctx.props` BEFORE calling this handler. We read
 * `ctx.props.{userId, role}` (stashed at consent time by
 * `mountAuthorize`) and gate staff surfaces on the D1 admin role.
 *
 * Note: OAuth scope distinction (`mcp:read` vs `mcp:staff`) used to
 * differentiate surfaces here. Removed because claude.ai's MCP client
 * silently omits `scope=` from /authorize when scopes contain colons,
 * which broke the consent flow. Staff vs public is now purely D1-role
 * driven.
 */
export function createMcpApiHandler(
  options: CreateMcpApiHandlerOptions,
): ExportedHandler<Record<string, unknown>> {
  const { ref, surface } = options;
  let dispatcher: McpJsonRpcDispatcher | null = null;

  return {
    async fetch(request, _env, ctx) {
      const props = (ctx as unknown as { props?: OAuthApiProps }).props;
      if (!props?.userId) return forbidden();
      const role = props.role;
      if (surface === "staff" && (!role || !ADMIN_ROLE_SET.has(role))) {
        return forbidden();
      }
      const runtime = await ref.get();
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
      return dispatcher.dispatch(request, {
        userId: props.userId,
        staff: role && ADMIN_ROLE_SET.has(role)
          ? { userId: props.userId, role: role as StaffRole }
          : null,
      });
    },
  };
}

function forbidden(): Response {
  return new Response("forbidden", {
    status: 403,
    headers: {
      "www-authenticate": `Bearer realm="mcp", error="insufficient_scope"`,
      "access-control-expose-headers": "WWW-Authenticate",
    },
  });
}

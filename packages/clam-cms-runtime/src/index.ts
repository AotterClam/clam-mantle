/**
 * `@aotterclam/clam-cms-runtime` — public surface.
 *
 * Adapter-agnostic runtime engine for clam-cms. Layered per the
 * Aotter clean-architecture convention (mirrors `aotter-clam/clam/core`):
 *
 *   domain ← usecase ← infrastructure ← runtime.ts (assembly root)
 *
 * Adapters (e.g. `@aotterclam/clam-cms-cloudflare`) implement the
 * required port interfaces in `domain/port/` and call `createCmsRuntime`
 * to compose everything. Optional feature ports (for example media
 * hosting) stay adapter-agnostic and are only wired when enabled.
 *
 * MUST NOT import `D1Database` / `KVNamespace` / any Cloudflare-
 * specific type. The Netlify stub package exists as a public reminder.
 */

// Assembly root.
export {
  createCmsRuntime,
  type CreateCmsRuntimeArgs,
  type CmsRuntime,
} from "./runtime.js";

// Adapter-facing ports. These are the stable boundary platform
// adapters implement; runtime-internal seams remain off the root
// surface unless there is a concrete consumer need.
export type {
  DatabaseDriver,
  PreparedStatement,
  RunResult,
  BatchResult,
  MigrationRunner,
  Migration,
} from "./domain/port/DatabaseDriver.js";
export type { KvCache, KvPutOptions, KvListResult } from "./domain/port/KvCache.js";
export type { SessionRepository, Session } from "./domain/port/SessionRepository.js";
export type { AssetServer } from "./domain/port/AssetServer.js";
export type { OAuthVerifier, OAuthIdentity } from "./domain/port/OAuthVerifier.js";
export type { UserRepository, GithubToken } from "./domain/port/UserRepository.js";
export type {
  StaffRepository,
  StaffListEntry,
  BootstrapOwnerOpts,
} from "./domain/port/StaffRepository.js";
export type {
  MediaStorage,
  CreateMediaUploadRequest,
  CreateMediaUploadResponse,
  CommitMediaUploadRequest,
  PutMediaObjectRequest,
  GetMediaPublicUrlRequest,
  DeleteMediaAssetRequest,
  MediaAsset,
} from "./domain/port/MediaStorage.js";
export type {
  RemoteMediaFetcher,
  FetchAllowedUrlRequest,
  FetchedMedia,
} from "./domain/port/RemoteMediaFetcher.js";

// Identity-layer model types consumed by adapters implementing the auth ports.
export type { User } from "./domain/model/User.js";
export type { GithubProfile } from "./domain/model/GithubProfile.js";
export type { Staff, StaffMembership } from "./domain/model/Staff.js";

// Consumer/starter handler and render contracts.
export type {
  AnyHandler,
  HandlerContext,
} from "./domain/model/HandlerContext.js";
export type { SeoMeta } from "./domain/model/SeoMeta.js";
export {
  TemplateRegistry,
  type EntryContext,
  type ListContext,
  type EntryTemplate,
  type ListTemplate,
} from "./domain/model/TemplateRegistry.js";
export {
  createPublicPathResolver,
  type PublicPathResolver,
  type PublicPathResolverConfig,
  type CollectionRoute,
} from "./domain/service/PublicPathResolver.js";
export {
  composeEntrySeoMeta,
  renderSeoTagsHtml,
  type ComposeEntrySeoMetaArgs,
  type SiblingTranslation,
} from "./domain/service/SeoMetaComposer.js";

// Public route / starter fixture helpers. These are intentionally
// exported one-by-one instead of exposing the whole service barrel.
export {
  entryHtmlKey,
  entryMarkdownKey,
  entryHtmlKeyFromParts,
  entryMarkdownKeyFromParts,
  listHtmlKey,
  llmsTxtKey,
} from "./domain/service/PublishKeys.js";
export { serializeEntryAsMarkdown } from "./domain/service/MarkdownSerializer.js";
export { readEntryBySlug } from "./domain/service/PublishedEntries.js";
export {
  inferLocaleFromPath,
  isKnownLocale,
  siteConfigFromDefaults,
  toUrlLocale,
} from "./domain/service/LocaleNegotiator.js";
export { matchPath } from "./domain/service/PathMatcher.js";
export {
  coerceViewParams,
  ViewParamCoercionError,
} from "./domain/service/ViewParamCoercer.js";

// Explicit adapter contract for the Cloudflare MCP mount. Do not
// export the whole MCP infrastructure barrel from the root.
export {
  McpJsonRpcDispatcher,
  type McpAuthContext,
  type McpUseCases,
} from "./infrastructure/mcp/McpJsonRpcDispatcher.js";

// Starter fixture support. Kept explicit so persistence/http/auth
// infrastructure do not become root public API by accident.
export { CANONICAL_MIGRATIONS } from "./infrastructure/boot/canonicalMigrations.js";

// Cookie session helpers — adapters use these to stay consistent with
// the session name used by the runtime's session-assembly infrastructure.
export { DEFAULT_SESSION_COOKIE, readCookie } from "./infrastructure/auth/CookieReader.js";

// Procedure handler failure carrier used by platform helper handlers
// such as Cloudflare Turnstile.
export { InvokeFailure } from "./usecase/procedure/InvokeProcedureUseCase.js";

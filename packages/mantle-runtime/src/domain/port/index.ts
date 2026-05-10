/**
 * `domain/port/` — interface contracts the use cases depend on.
 * Concrete implementations live in `infrastructure/` (or in adapter
 * packages like `@aotter/mantle-cloudflare`).
 *
 * Required adapter ports — `DatabaseDriver`, `KvCache`, `AssetServer`.
 * Optional feature ports — `MediaStorage` (public-bucket media
 * uploads). Dispatcher-internal seams — `Clock`, `IdGenerator`,
 * `HandlerRegistry`, `EntryRepository`. Identity / session / OAuth
 * live outside the runtime via Better Auth (ADR-0014).
 *
 * Per the Aotter clean-architecture convention, no `*Port` suffix;
 * ports are discoverable by the package alone.
 */
export type {
  DatabaseDriver,
  PreparedStatement,
  RunResult,
  BatchResult,
  MigrationRunner,
  Migration,
} from "./DatabaseDriver.js";
export type { KvCache, KvPutOptions, KvListResult } from "./KvCache.js";
export type { AssetServer } from "./AssetServer.js";
export type {
  EntryRepository,
  CreateEntryArgs,
  UpdateEntryArgs,
  DeleteEntryArgs,
  ArchiveEntryArgs,
  TransitionStatusArgs,
  ListEntriesArgs,
  MutationHookFields,
} from "./EntryRepository.js";
export type { SiteConfigRepository } from "./SiteConfigRepository.js";
export type {
  PublishOrchestrator,
  PublishEntryRequest,
} from "./PublishOrchestrator.js";
export type {
  MediaStorage,
  CreateUploadArgs,
  CreateUploadResult,
  CommitUploadArgs,
  GetPublicUrlArgs,
  DeleteAssetArgs,
  MediaAsset,
} from "./MediaStorage.js";
export type {
  LifecycleHookRunner,
  RunLifecycleHookRequest,
} from "./LifecycleHookRunner.js";
export type {
  DurableHookDispatcher,
  AfterHookEnvelope,
  CtxSnapshot,
} from "./DurableHookDispatcher.js";
export { type Clock, SystemClock } from "./Clock.js";
export { type IdGenerator, RandomUuidGenerator } from "./IdGenerator.js";
export {
  type HandlerRegistry,
  InMemoryHandlerRegistry,
  buildHandlerRegistry,
} from "./HandlerRegistry.js";

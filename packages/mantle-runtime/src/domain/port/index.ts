/**
 * `domain/port/` — interface contracts the use cases depend on.
 * Concrete implementations live in `infrastructure/` (or in adapter
 * packages like `@aotter/mantle-cloudflare`).
 *
 * The five ADR-0011 ports — `DatabaseDriver`, `KvCache`,
 * `SessionRepository`, `AssetServer`, `OAuthVerifier` — plus
 * dispatcher-internal ports `Clock`, `IdGenerator`, `HandlerRegistry`,
 * and the chokepoint `EntryRepository`.
 *
 * Per the Aotter naming convention (rmn-r / trek-dmp / mantle-core), no
 * `*Port` suffix; ports are discoverable by the package alone.
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
export type { SessionRepository, Session } from "./SessionRepository.js";
export type { AssetServer } from "./AssetServer.js";
export type { OAuthVerifier, OAuthIdentity } from "./OAuthVerifier.js";
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
  LifecycleHookRunner,
  RunLifecycleHookRequest,
} from "./LifecycleHookRunner.js";
export { type Clock, SystemClock } from "./Clock.js";
export { type IdGenerator, RandomUuidGenerator } from "./IdGenerator.js";
export {
  type HandlerRegistry,
  InMemoryHandlerRegistry,
  buildHandlerRegistry,
} from "./HandlerRegistry.js";

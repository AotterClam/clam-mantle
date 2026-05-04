import {
  partitionManifests,
  type Manifest,
  type ProcedureManifest,
  type SchemaManifest,
  type SiteDefaults,
  type TriggerManifest,
  type ViewManifest,
} from "@aotterclam/clam-cms-spec";
import type { AnyHandler } from "./domain/model/HandlerContext.js";
import type { AssetServer } from "./domain/port/AssetServer.js";
import type { DatabaseDriver } from "./domain/port/DatabaseDriver.js";
import type { KvCache } from "./domain/port/KvCache.js";
import type { OAuthVerifier } from "./domain/port/OAuthVerifier.js";
import type { SessionRepository } from "./domain/port/SessionRepository.js";
import { SystemClock, type Clock } from "./domain/port/Clock.js";
import {
  RandomUuidGenerator,
  type IdGenerator,
} from "./domain/port/IdGenerator.js";
import {
  buildHandlerRegistry,
  type HandlerRegistry,
} from "./domain/port/HandlerRegistry.js";

import {
  ArchiveUseCase,
  CreateDraftUseCase,
  DeleteEntryUseCase,
  GetEntryUseCase,
  ListEntriesUseCase,
  RequestPublishUseCase,
  UnpublishUseCase,
  UpdateDraftUseCase,
} from "./usecase/content/index.js";
import { InvokeProcedureUseCase } from "./usecase/procedure/index.js";
import { ExecuteViewUseCase } from "./usecase/view/index.js";
import { ValidateBootUseCase } from "./usecase/boot/index.js";

import { DatabaseEntryRepository } from "./infrastructure/persistence/DatabaseEntryRepository.js";
import { DatabaseSiteConfigRepository } from "./infrastructure/persistence/DatabaseSiteConfigRepository.js";
import {
  HtmlPublishOrchestrator,
  TemplateRegistry,
} from "./infrastructure/render/index.js";
import { CANONICAL_MIGRATIONS } from "./infrastructure/boot/index.js";

/**
 * `createCmsRuntime` — assembly root. Per the clean-architecture
 * convention, this file is the only place that wires concrete
 * adapters (`infrastructure/persistence/*`, `infrastructure/render/*`)
 * to use cases (`usecase/content/*`, etc.) via ports
 * (`domain/port/*`).
 *
 * Adapters call this once at boot, pass the 5 ADR-0011 ports + the
 * consumer's manifests + handlers + templates + siteDefaults, and
 * receive a `CmsRuntime` they expose to their HTTP framework's
 * routing layer.
 *
 * `bootInit()` runs migrations, seeds `siteDefaults`, and validates
 * the manifest set against the registry. Throws `BootValidationError`
 * on any boot diagnostic — adapters surface the error in their init
 * logs.
 */
export interface CreateCmsRuntimeArgs {
  readonly manifests: readonly Manifest[];
  readonly handlers?: Readonly<Record<string, AnyHandler>>;
  readonly templates?: TemplateRegistry;
  readonly siteDefaults?: SiteDefaults;
  /** The 5 ADR-0011 ports. */
  readonly db: DatabaseDriver;
  readonly kv: KvCache;
  readonly sessions: SessionRepository;
  readonly assets: AssetServer;
  readonly oauth: OAuthVerifier;
  /** Optional clock — test seam. Defaults to `SystemClock`. */
  readonly clock?: Clock;
  /** Optional id generator — test seam. Defaults to `RandomUuidGenerator`. */
  readonly idgen?: IdGenerator;
}

export interface CmsRuntime {
  /** The 5 ports — re-exposed so adapters can pass them downstream. */
  readonly db: DatabaseDriver;
  readonly kv: KvCache;
  readonly sessions: SessionRepository;
  readonly assets: AssetServer;
  readonly oauth: OAuthVerifier;

  /** Use cases (pre-wired with ports + clock + idgen). */
  readonly createDraft: CreateDraftUseCase;
  readonly updateDraft: UpdateDraftUseCase;
  readonly getEntry: GetEntryUseCase;
  readonly listEntries: ListEntriesUseCase;
  readonly requestPublish: RequestPublishUseCase;
  readonly unpublish: UnpublishUseCase;
  readonly archive: ArchiveUseCase;
  readonly deleteEntry: DeleteEntryUseCase;
  readonly invokeProcedure: InvokeProcedureUseCase;
  readonly executeView: ExecuteViewUseCase;
  readonly validateBoot: ValidateBootUseCase;
  readonly publishOrchestrator: HtmlPublishOrchestrator;
  readonly siteConfig: DatabaseSiteConfigRepository;

  /** Adapter-helper bag. */
  readonly registry: HandlerRegistry;
  readonly templates: TemplateRegistry;
  readonly schemasByName: ReadonlyMap<string, SchemaManifest>;
  readonly proceduresByName: ReadonlyMap<string, ProcedureManifest>;
  readonly viewsByName: ReadonlyMap<string, ViewManifest>;
  readonly triggers: readonly TriggerManifest[];
  readonly clock: Clock;
  readonly idgen: IdGenerator;

  /** Run migrations, seed siteDefaults, and validate boot. Adapters
   *  call this once per isolate before routing requests. */
  bootInit(): Promise<void>;
}

export function createCmsRuntime(args: CreateCmsRuntimeArgs): CmsRuntime {
  const partitioned = partitionManifests([...args.manifests]);
  const schemasByName = new Map<string, SchemaManifest>();
  for (const s of partitioned.schemas) schemasByName.set(s.metadata.name, s);
  const proceduresByName = new Map<string, ProcedureManifest>();
  for (const p of partitioned.procedures) proceduresByName.set(p.metadata.name, p);
  const viewsByName = new Map<string, ViewManifest>();
  for (const v of partitioned.views) viewsByName.set(v.metadata.name, v);

  const registry = buildHandlerRegistry(args.handlers ?? {});
  const templates = args.templates ?? new TemplateRegistry();
  const clock = args.clock ?? SystemClock;
  const idgen = args.idgen ?? RandomUuidGenerator;

  // Repositories (adapters that bind ports) and orchestrators.
  const entries = new DatabaseEntryRepository(args.db);
  const siteConfig = new DatabaseSiteConfigRepository(args.db);
  const publishOrchestrator = new HtmlPublishOrchestrator(args.db, args.kv);

  // Use cases (constructor-injected with ports + repositories + clock + idgen).
  const createDraft = new CreateDraftUseCase(entries, schemasByName, clock, idgen);
  const updateDraft = new UpdateDraftUseCase(entries, clock);
  const getEntry = new GetEntryUseCase(entries);
  const listEntries = new ListEntriesUseCase(entries, schemasByName);
  const requestPublish = new RequestPublishUseCase(entries, schemasByName, clock);
  const unpublish = new UnpublishUseCase(entries, clock);
  const archive = new ArchiveUseCase(entries, schemasByName, clock);
  const deleteEntry = new DeleteEntryUseCase(entries);
  const invokeProcedure = new InvokeProcedureUseCase(registry);
  const executeView = new ExecuteViewUseCase(args.db);
  const validateBoot = new ValidateBootUseCase();

  return {
    db: args.db,
    kv: args.kv,
    sessions: args.sessions,
    assets: args.assets,
    oauth: args.oauth,

    createDraft,
    updateDraft,
    getEntry,
    listEntries,
    requestPublish,
    unpublish,
    archive,
    deleteEntry,
    invokeProcedure,
    executeView,
    validateBoot,
    publishOrchestrator,
    siteConfig,

    registry,
    templates,
    schemasByName,
    proceduresByName,
    viewsByName,
    triggers: partitioned.triggers,
    clock,
    idgen,

    async bootInit(): Promise<void> {
      await args.db.migrations.runAll(CANONICAL_MIGRATIONS);
      await siteConfig.seed(args.siteDefaults);
      const siteLocales = await siteConfig.readLocales();
      validateBoot.assert({
        manifests: args.manifests,
        registry,
        siteLocales,
      });
    },
  };
}

import {
  partitionManifests,
  type Manifest,
  type ProcedureManifest,
  type SchemaManifest,
  type SiteDefaults,
  type TriggerManifest,
  type ViewManifest,
} from "@aotter/mantle-spec";
import type { AnyHandler } from "./domain/model/HandlerContext.js";
import type { TemplateRegistry } from "./domain/model/TemplateRegistry.js";
import type { AssetServer } from "./domain/port/AssetServer.js";
import type { DatabaseDriver } from "./domain/port/DatabaseDriver.js";
import type { EntryRepository } from "./domain/port/EntryRepository.js";
import type { KvCache } from "./domain/port/KvCache.js";
import type { OAuthVerifier } from "./domain/port/OAuthVerifier.js";
import type { PublishOrchestrator } from "./domain/port/PublishOrchestrator.js";
import type { SessionRepository } from "./domain/port/SessionRepository.js";
import type { UserRepository } from "./domain/port/UserRepository.js";
import type { StaffRepository } from "./domain/port/StaffRepository.js";
import type { SiteConfigRepository } from "./domain/port/SiteConfigRepository.js";
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
import {
  InvokeBuiltinUseCase,
  InvokeProcedureUseCase,
} from "./usecase/procedure/index.js";
import { ExecuteViewUseCase } from "./usecase/view/index.js";
import { ValidateBootUseCase } from "./usecase/boot/index.js";
import { RunLifecycleHooksUseCase } from "./usecase/lifecycle/index.js";
import {
  ComposeEntrySeoMetaUseCase,
  ComposeLlmsTxtUseCase,
  ComposeSitemapUseCase,
  PreviewEntryUseCase,
  RenderEntryLiveUseCase,
  RenderListLiveUseCase,
} from "./usecase/render/index.js";
import type { PublicPathResolver } from "./domain/service/PublicPathResolver.js";

import { TemplateRegistry as TemplateRegistryImpl } from "./domain/model/TemplateRegistry.js";
import { TriggerIndex } from "./domain/service/TriggerIndex.js";
import { DatabaseEntryRepository } from "./infrastructure/persistence/DatabaseEntryRepository.js";
import { DatabaseSiteConfigRepository } from "./infrastructure/persistence/DatabaseSiteConfigRepository.js";
import { LifecycleHookingEntryRepository } from "./infrastructure/persistence/LifecycleHookingEntryRepository.js";
import { HtmlPublishOrchestrator } from "./infrastructure/render/index.js";
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
  /** The 5 ADR-0011 ports + identity layer. */
  readonly db: DatabaseDriver;
  readonly kv: KvCache;
  readonly sessions: SessionRepository;
  readonly assets: AssetServer;
  readonly oauth: OAuthVerifier;
  readonly users: UserRepository;
  readonly staff: StaffRepository;
  /** Optional public-path resolver. When set, the publish pipeline
   *  composes SEO/AEO meta on every entry render and the resolved
   *  paths drive sitemap / hreflang sibling URLs. Adapters that
   *  expose request-time render routes should also pass this through
   *  so request-time HTML matches publish-time HTML. */
  readonly publicPathResolver?: PublicPathResolver;
  /** Optional clock — test seam. Defaults to `SystemClock`. */
  readonly clock?: Clock;
  /** Optional id generator — test seam. Defaults to `RandomUuidGenerator`. */
  readonly idgen?: IdGenerator;
}

export interface CmsRuntime {
  /** The 5 ADR-0011 ports + identity layer — re-exposed so adapters can pass them downstream. */
  readonly db: DatabaseDriver;
  readonly kv: KvCache;
  readonly sessions: SessionRepository;
  readonly assets: AssetServer;
  readonly oauth: OAuthVerifier;
  readonly users: UserRepository;
  readonly staff: StaffRepository;

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
  readonly composeLlmsTxt: ComposeLlmsTxtUseCase;
  readonly composeSitemap: ComposeSitemapUseCase;
  readonly composeEntrySeoMeta: ComposeEntrySeoMetaUseCase;
  readonly renderEntryLive: RenderEntryLiveUseCase;
  readonly renderListLive: RenderListLiveUseCase;
  readonly previewEntry: PreviewEntryUseCase;
  readonly validateBoot: ValidateBootUseCase;
  readonly publishOrchestrator: PublishOrchestrator;
  readonly siteConfig: SiteConfigRepository;
  /** The resolver passed at boot, or `null` when the consumer didn't
   *  supply one. Adapters use this to derive URLs (sitemap, SEO
   *  hreflangs) without rebuilding the mapping. */
  readonly publicPathResolver: PublicPathResolver | null;

  /** Adapter-helper bag. */
  readonly registry: HandlerRegistry;
  readonly templates: TemplateRegistry;
  readonly schemasByName: ReadonlyMap<string, SchemaManifest>;
  readonly proceduresByName: ReadonlyMap<string, ProcedureManifest>;
  readonly viewsByName: ReadonlyMap<string, ViewManifest>;
  readonly triggers: readonly TriggerManifest[];
  readonly triggersByName: ReadonlyMap<string, TriggerManifest>;
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
  const triggersByName = new Map<string, TriggerManifest>();
  for (const t of partitioned.triggers) triggersByName.set(t.metadata.name, t);

  const registry = buildHandlerRegistry(args.handlers ?? {});
  const templates = args.templates ?? new TemplateRegistryImpl();
  const clock = args.clock ?? SystemClock;
  const idgen = args.idgen ?? RandomUuidGenerator;

  // Repositories: DB-backed inner + lifecycle-hook decorator. Every
  // mutation through `entries` (create / update / delete / archive /
  // transitionStatus) fires the matching Triggers via
  // `RunLifecycleHooksUseCase`. Symmetric chokepoint per POC ADR-0014:
  // MCP, admin, and builtin paths all hit the same wrapped repository.
  const innerEntries = new DatabaseEntryRepository(args.db);
  const triggerIndex = new TriggerIndex(partitioned.triggers);
  // `entries` is filled below — assigned via `let` so the lifecycle
  // hooks (which run procedures, which can themselves write entries
  // via builtin handlers) close over the wrapped repo, not the bare
  // DB-backed one. Without this every builtin write inside a hook
  // would skip the decorator and silently bypass downstream hooks.
  let entries: EntryRepository;
  const entriesProxy: EntryRepository = {
    create: (a) => entries.create(a),
    get: (id) => entries.get(id),
    update: (a) => entries.update(a),
    delete: (a) => entries.delete(a),
    archive: (a) => entries.archive(a),
    transitionStatus: (a) => entries.transitionStatus(a),
    list: (a) => entries.list(a),
  };
  const invokeBuiltin = new InvokeBuiltinUseCase(entriesProxy, schemasByName, clock, idgen);
  const invokeProcedure = new InvokeProcedureUseCase(registry, invokeBuiltin);
  const lifecycleHooks = new RunLifecycleHooksUseCase(
    triggerIndex,
    proceduresByName,
    invokeProcedure,
  );
  entries = new LifecycleHookingEntryRepository(
    innerEntries,
    triggerIndex,
    lifecycleHooks,
  );
  const siteConfig = new DatabaseSiteConfigRepository(args.db);
  const publicPathResolver = args.publicPathResolver ?? null;
  const composeEntrySeoMeta = new ComposeEntrySeoMetaUseCase(args.db);
  const publishOrchestrator = new HtmlPublishOrchestrator(
    args.db,
    args.kv,
    publicPathResolver,
    composeEntrySeoMeta,
  );

  // Content / view / boot use cases. They see `entries` only as the
  // chokepoint port — hook firing is invisible to them.
  const createDraft = new CreateDraftUseCase(entries, schemasByName, clock, idgen);
  const updateDraft = new UpdateDraftUseCase(entries, schemasByName, clock);
  const getEntry = new GetEntryUseCase(entries);
  const listEntries = new ListEntriesUseCase(entries, schemasByName);
  const contentPublishEffects = { publishOrchestrator, siteConfig, templates };
  const requestPublish = new RequestPublishUseCase(
    entries,
    schemasByName,
    clock,
    contentPublishEffects,
  );
  const unpublish = new UnpublishUseCase(entries, clock, contentPublishEffects);
  const archive = new ArchiveUseCase(entries, schemasByName, clock, contentPublishEffects);
  const deleteEntry = new DeleteEntryUseCase(entries);
  const executeView = new ExecuteViewUseCase(args.db);
  const composeLlmsTxt = new ComposeLlmsTxtUseCase(args.db);
  const composeSitemap = new ComposeSitemapUseCase(args.db);
  const renderEntryLive = new RenderEntryLiveUseCase(
    args.db,
    templates,
    publicPathResolver,
    composeEntrySeoMeta,
  );
  const renderListLive = new RenderListLiveUseCase(args.db, templates);
  const previewEntry = new PreviewEntryUseCase(
    args.db,
    templates,
    publicPathResolver,
    composeEntrySeoMeta,
  );
  const validateBoot = new ValidateBootUseCase();

  return {
    db: args.db,
    kv: args.kv,
    sessions: args.sessions,
    assets: args.assets,
    oauth: args.oauth,
    users: args.users,
    staff: args.staff,

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
    composeLlmsTxt,
    composeSitemap,
    composeEntrySeoMeta,
    renderEntryLive,
    renderListLive,
    previewEntry,
    validateBoot,
    publishOrchestrator,
    siteConfig,
    publicPathResolver,

    registry,
    templates,
    schemasByName,
    proceduresByName,
    viewsByName,
    triggers: partitioned.triggers,
    triggersByName,
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

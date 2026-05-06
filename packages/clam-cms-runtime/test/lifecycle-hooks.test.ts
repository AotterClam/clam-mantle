import { describe, expect, it } from "vitest";
import {
  DiagnosticError,
  type ProcedureManifest,
} from "@aotterclam/clam-cms-spec";
import type { Clock } from "../src/domain/port/Clock.js";
import type { IdGenerator } from "../src/domain/port/IdGenerator.js";
import { InMemoryHandlerRegistry } from "../src/domain/port/HandlerRegistry.js";
import { TriggerIndex } from "../src/domain/service/TriggerIndex.js";
import { LifecycleHookingEntryRepository } from "../src/infrastructure/persistence/LifecycleHookingEntryRepository.js";
import {
  CreateDraftUseCase,
  UpdateDraftUseCase,
  DeleteEntryUseCase,
  RequestPublishUseCase,
} from "../src/usecase/content/index.js";
import { RunLifecycleHooksUseCase } from "../src/usecase/lifecycle/index.js";
import { InvokeProcedureUseCase } from "../src/usecase/procedure/InvokeProcedureUseCase.js";
import { InMemoryEntryRepository } from "./fakes/in-memory-store.js";
import {
  makeLifecycleTrigger,
  makeProcedure,
  postsSchema,
} from "./fakes/manifests.js";

const clock: Clock = { now: () => 1_700_000_000_000 };
const idgen: IdGenerator = { next: () => "post-1" };

interface Harness {
  store: InMemoryEntryRepository;
  hookedRepo: LifecycleHookingEntryRepository;
  registry: InMemoryHandlerRegistry;
  proceduresByName: ReadonlyMap<string, ProcedureManifest>;
  createDraft: CreateDraftUseCase;
  updateDraft: UpdateDraftUseCase;
  deleteEntry: DeleteEntryUseCase;
  requestPublish: RequestPublishUseCase;
  calls: string[];
}

function harness(opts: {
  procedures: readonly ProcedureManifest[];
  triggers: readonly Parameters<typeof makeLifecycleTrigger>[0][];
  handlers: Record<string, (input: unknown, ctx: unknown) => unknown>;
}): Harness {
  const store = new InMemoryEntryRepository();
  const schemas = new Map([[postsSchema().metadata.name, postsSchema()]]);
  const proceduresByName = new Map(opts.procedures.map((p) => [p.metadata.name, p]));
  const registry = new InMemoryHandlerRegistry();
  const calls: string[] = [];
  for (const [ref, fn] of Object.entries(opts.handlers)) {
    registry.register(ref, ((input: unknown, ctx: unknown) => {
      calls.push(ref);
      return fn(input, ctx);
    }) as unknown as Parameters<InMemoryHandlerRegistry["register"]>[1]);
  }
  const triggers = opts.triggers.map(makeLifecycleTrigger);
  const triggerIndex = new TriggerIndex(triggers);
  const invoke = new InvokeProcedureUseCase(registry);
  const hookRunner = new RunLifecycleHooksUseCase(triggerIndex, proceduresByName, invoke);
  const hookedRepo = new LifecycleHookingEntryRepository(store, triggerIndex, hookRunner);
  return {
    store,
    hookedRepo,
    registry,
    proceduresByName,
    calls,
    createDraft: new CreateDraftUseCase(hookedRepo, schemas, clock, idgen),
    updateDraft: new UpdateDraftUseCase(hookedRepo, schemas, clock),
    deleteEntry: new DeleteEntryUseCase(hookedRepo),
    requestPublish: new RequestPublishUseCase(hookedRepo, schemas, clock),
  };
}

const captchaProcedure: ProcedureManifest = makeProcedure({
  name: "captchaCheck",
  handlerRef: "captchaCheck",
  input: { type: "object" },
  output: { type: "object" },
});

const slackProcedure: ProcedureManifest = makeProcedure({
  name: "slackNotify",
  handlerRef: "slackNotify",
  input: { type: "object" },
  output: { type: "object" },
});

describe("LifecycleHookingEntryRepository — before_create", () => {
  it("fires before_create then writes when handler returns OK", async () => {
    const h = harness({
      procedures: [captchaProcedure],
      triggers: [
        {
          procedure: "captchaCheck",
          schema: "posts",
          on: ["before_create"],
          errorPolicy: "abort",
        },
      ],
      handlers: { captchaCheck: () => ({ ok: true }) },
    });
    const row = await h.createDraft.execute({
      collection: "posts",
      data: { title: "Hello" },
      authorId: null,
    });
    expect(h.calls).toEqual(["captchaCheck"]);
    expect(row.status).toBe("draft");
    expect(await h.store.get(row.id)).not.toBeNull();
  });

  it("aborts the create when before_create handler throws (errorPolicy default)", async () => {
    const h = harness({
      procedures: [captchaProcedure],
      triggers: [
        {
          procedure: "captchaCheck",
          schema: "posts",
          on: ["before_create"],
        },
      ],
      handlers: {
        captchaCheck: () => {
          throw new Error("captcha failed");
        },
      },
    });
    await expect(
      h.createDraft.execute({
        collection: "posts",
        data: { title: "x" },
        authorId: null,
      }),
    ).rejects.toBeInstanceOf(DiagnosticError);
    // Ensure no row was written.
    const rows = await h.store.list({ collection: "posts" });
    expect(rows).toHaveLength(0);
  });

  it("does NOT abort when errorPolicy is overridden to 'continue' on a before_* hook", async () => {
    const h = harness({
      procedures: [captchaProcedure],
      triggers: [
        {
          procedure: "captchaCheck",
          schema: "posts",
          on: ["before_create"],
          errorPolicy: "continue",
        },
      ],
      handlers: {
        captchaCheck: () => {
          throw new Error("captcha hiccup");
        },
      },
    });
    const row = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    expect(row.id).toBe("post-1");
  });
});

describe("LifecycleHookingEntryRepository — after_*", () => {
  it("fires after_create after write completes", async () => {
    const h = harness({
      procedures: [slackProcedure],
      triggers: [
        {
          procedure: "slackNotify",
          schema: "posts",
          on: ["after_create"],
        },
      ],
      handlers: { slackNotify: () => ({ ok: true }) },
    });
    await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    expect(h.calls).toEqual(["slackNotify"]);
  });

  it("rides on ctx.waitUntil when adapter populates it", async () => {
    let captured: Promise<unknown> | null = null;
    const h = harness({
      procedures: [slackProcedure],
      triggers: [
        {
          procedure: "slackNotify",
          schema: "posts",
          on: ["after_create"],
        },
      ],
      handlers: { slackNotify: () => ({ ok: true }) },
    });
    await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
      ctx: {
        user: null,
        staff: null,
        env: {},
        waitUntil: (p) => {
          captured = p;
        },
      },
    });
    expect(captured).not.toBeNull();
    await captured;
    expect(h.calls).toEqual(["slackNotify"]);
  });

  it("after_* handler throw is logged and swallowed (errorPolicy continue default)", async () => {
    const h = harness({
      procedures: [slackProcedure],
      triggers: [
        {
          procedure: "slackNotify",
          schema: "posts",
          on: ["after_create"],
        },
      ],
      handlers: {
        slackNotify: () => {
          throw new Error("slack down");
        },
      },
    });
    // No throw expected from the create itself.
    const row = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    expect(row.id).toBe("post-1");
  });
});

describe("LifecycleHookingEntryRepository — publish + delete", () => {
  it("transitionStatus({to: 'published'}) fires before_publish + after_publish", async () => {
    const h = harness({
      procedures: [slackProcedure],
      triggers: [
        {
          procedure: "slackNotify",
          schema: "posts",
          on: ["before_publish", "after_publish"],
        },
      ],
      handlers: { slackNotify: () => ({ ok: true }) },
    });
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    h.calls.length = 0;
    await h.requestPublish.execute({ id: created.id });
    expect(h.calls).toEqual(["slackNotify", "slackNotify"]);
  });

  it("delete fires before_delete + after_delete", async () => {
    const h = harness({
      procedures: [slackProcedure],
      triggers: [
        {
          procedure: "slackNotify",
          schema: "posts",
          on: ["before_delete", "after_delete"],
        },
      ],
      handlers: { slackNotify: () => ({ ok: true }) },
    });
    const created = await h.createDraft.execute({
      collection: "posts",
      data: { title: "x" },
      authorId: null,
    });
    h.calls.length = 0;
    await h.deleteEntry.execute({ id: created.id });
    expect(h.calls).toEqual(["slackNotify", "slackNotify"]);
  });

  it("short-circuits when no Trigger watches the collection", async () => {
    const h = harness({
      procedures: [],
      triggers: [],
      handlers: {},
    });
    const row = await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    expect(row.id).toBe("post-1");
    expect(h.calls).toEqual([]);
  });

  it("does NOT fire before_* hooks when the row doesn't exist (null-entry guard)", async () => {
    const h = harness({
      procedures: [
        makeProcedure({
          name: "audit",
          handlerRef: "audit",
          input: { type: "object" },
          output: { type: "object" },
        }),
      ],
      triggers: [
        {
          procedure: "audit",
          schema: "posts",
          on: ["before_delete", "before_update"],
        },
      ],
      handlers: {
        audit: () => ({ ok: true }),
      },
    });
    // Direct repo call (bypassing use cases that pre-check NOT_FOUND):
    // simulates the InvokeBuiltinUseCase opDelete path which doesn't
    // pre-verify the row exists.
    await h.hookedRepo.delete({ id: "ghost", collection: "posts" });
    expect(h.calls).toEqual([]);
    // OCC will throw on a ghost update at the inner repo, but the hook
    // must not fire either way — wrap in try/catch.
    await h.hookedRepo
      .update({ id: "ghost", collection: "posts", expectedVersion: 1, data: {}, now: 0 })
      .catch(() => undefined);
    expect(h.calls).toEqual([]);
  });
});

describe("LifecycleHookingEntryRepository — multi-trigger ordering", () => {
  it("fires Triggers in alphabetical order by metadata.name", async () => {
    const permissive = { input: { type: "object" }, output: { type: "object" } };
    const h = harness({
      procedures: [
        makeProcedure({ name: "p1", handlerRef: "h1", ...permissive }),
        makeProcedure({ name: "p2", handlerRef: "h2", ...permissive }),
        makeProcedure({ name: "p3", handlerRef: "h3", ...permissive }),
      ],
      triggers: [
        { name: "030-third", procedure: "p3", schema: "posts", on: ["before_create"] },
        { name: "010-first", procedure: "p1", schema: "posts", on: ["before_create"] },
        { name: "020-second", procedure: "p2", schema: "posts", on: ["before_create"] },
      ],
      handlers: {
        h1: () => ({ ok: true }),
        h2: () => ({ ok: true }),
        h3: () => ({ ok: true }),
      },
    });
    await h.createDraft.execute({
      collection: "posts",
      data: {},
      authorId: null,
    });
    expect(h.calls).toEqual(["h1", "h2", "h3"]);
  });
});

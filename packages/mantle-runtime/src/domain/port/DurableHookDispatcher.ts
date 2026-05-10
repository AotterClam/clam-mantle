import type { LifecycleHook, StaffRole } from "@aotter/mantle-spec";
import type { EntryRow } from "../model/EntryRow.js";

/**
 * Optional adapter port for delivering `after_*` lifecycle hooks via
 * a durable queue. The adapter's queue consumer rehydrates the
 * envelope and calls `CmsRuntime.consumeDurableHook` on the consume
 * side. Absent a dispatcher, the decorator's `fireAfter` ladder
 * downgrades to `ctx.waitUntil` then inline-await.
 *
 * Contract: a thrown rejection from `enqueue` is treated as a hard
 * durability failure — the decorator catches it and downgrades to
 * the next rung. Adapters should swallow transient errors they can
 * tolerate themselves; only escalate when the hook genuinely cannot
 * be queued.
 */
export interface DurableHookDispatcher {
  enqueue(envelope: AfterHookEnvelope): Promise<void>;
}

/**
 * Wire envelope for a deferred `after_*` lifecycle hook. Carries
 * everything the consume side needs to reconstruct the original
 * `RunLifecycleHookRequest` without re-reading the database.
 *
 * `entry` is the row at fire time — for `after_delete` the row is
 * already gone from the DB, so the envelope must carry it. For other
 * `after_*` hooks the row also matches what the in-process firing path
 * would have seen, avoiding read-skew with subsequent mutations.
 *
 * `ctxSnapshot` carries enough identity to rebuild a `HandlerContext`
 * with the original actor's user/staff fields. `waitUntil` is dropped —
 * the consume invocation owns its own request lifetime — and `env` is
 * filled from the consume-side adapter binding.
 */
export interface AfterHookEnvelope {
  readonly hook: LifecycleHook;
  readonly schema: string;
  readonly entry: EntryRow;
  readonly originalInput?: unknown;
  readonly ctxSnapshot: CtxSnapshot | null;
}

export interface CtxSnapshot {
  readonly userId: string | null;
  readonly staffId: string | null;
  readonly staffRole: StaffRole | null;
}

import type { LifecycleHook } from "@aotterclam/clam-mantle-spec";
import type { EntryRow } from "../model/EntryRow.js";
import type { HandlerContext } from "../model/HandlerContext.js";

/**
 * Fires every Trigger bound to (schema, hook) in alphabetical name
 * order (POC ADR-0014). Implemented by `usecase/lifecycle/
 * RunLifecycleHooksUseCase`; consumed by the entry-writer decorator
 * (`infrastructure/persistence/LifecycleHookingEntryRepository`).
 *
 * Honors per-Trigger `errorPolicy`:
 *   - `abort` (only allowed on before_*): handler throw → `run` throws
 *     a DiagnosticError so the surrounding mutation cancels.
 *   - `continue`: handler throw is logged via `console.error` and
 *     swallowed. (POC v0.1.x parity; observability table is v0.2.)
 *
 * The runner itself awaits every Trigger inline. The decorator decides
 * whether to ride on `ctx.waitUntil` (CF Workers fast-path) or
 * inline-await the result; it's not the runner's concern.
 *
 * Lives in `domain/port/` per Aotter clean-arch convention; the
 * implementing use case lives in `usecase/lifecycle/` and is wired at
 * the assembly root.
 */
export interface LifecycleHookRunner {
  run(request: RunLifecycleHookRequest): Promise<void>;
}

export interface RunLifecycleHookRequest {
  readonly hook: LifecycleHook;
  readonly schema: string;
  /** Pre-mutation row for `before_*` hooks; persisted post-mutation
   *  row for `after_*`. `null` only on `before_create` (no row exists
   *  yet). */
  readonly entry: EntryRow | null;
  readonly ctx: HandlerContext;
  /** Pre-projection original input. For builtin Procedure path this is
   *  the procedure's full input (incl. side-channel fields like a
   *  CAPTCHA token); for non-builtin paths (admin / MCP createDraft)
   *  it's typically the raw write payload. May be undefined. */
  readonly originalInput?: unknown;
}

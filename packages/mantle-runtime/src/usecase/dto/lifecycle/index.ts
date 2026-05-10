import type { DeferredHookEnvelope } from "../../../domain/port/DeferredHookDispatcher.js";

/**
 * Lifecycle use-case request DTOs. Per the clean-arch rule, every
 * use-case `execute` takes a single named DTO — no loose positional
 * primitives.
 */
export interface RunDeferredHookRequest {
  readonly envelope: DeferredHookEnvelope;
  /** Adapter binding bag from the consume-side invocation. Threaded
   *  into the rebuilt `HandlerContext` so handlers reach platform
   *  resources (D1, KV, queues, …) the same way they do on the
   *  inline path. Different invocation than the producer side. */
  readonly env: unknown;
}

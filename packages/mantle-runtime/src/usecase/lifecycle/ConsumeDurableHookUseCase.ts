import type { HandlerContext } from "../../domain/model/HandlerContext.js";
import type { AfterHookEnvelope } from "../../domain/port/DurableHookDispatcher.js";
import type { LifecycleHookRunner } from "../../domain/port/LifecycleHookRunner.js";

/**
 * Consume side of the durable after-hook path. Adapter queue
 * consumers (CF Workers `queue(batch, env)` for Workers Queues, etc.)
 * deserialize each `AfterHookEnvelope` and call `execute` with the
 * fresh per-invocation `env` binding bag.
 *
 * Reconstructs a `HandlerContext` that mirrors the original firing
 * context as far as identity is concerned (user / staff snapshot from
 * the envelope), with `env` filled by the consume invocation.
 * `waitUntil` is intentionally absent — the consume invocation owns
 * its own request lifetime; chaining another fire-and-forget here
 * would just reintroduce the durability gap the queue path closes.
 *
 * Errors from the underlying hook surface per the Trigger's
 * `errorPolicy`. The adapter is expected to translate a throw into the
 * platform's retry signal (e.g. `message.retry()` on CF Queues) so the
 * hook eventually succeeds or hits the dead-letter queue.
 */
export class ConsumeDurableHookUseCase {
  constructor(private readonly hooks: LifecycleHookRunner) {}

  async execute(envelope: AfterHookEnvelope, env: unknown): Promise<void> {
    const ctx: HandlerContext = {
      user: envelope.ctxSnapshot?.userId
        ? { id: envelope.ctxSnapshot.userId }
        : null,
      staff:
        envelope.ctxSnapshot?.staffId && envelope.ctxSnapshot.staffRole
          ? { id: envelope.ctxSnapshot.staffId, role: envelope.ctxSnapshot.staffRole }
          : null,
      env,
    };
    await this.hooks.run({
      hook: envelope.hook,
      schema: envelope.schema,
      entry: envelope.entry,
      ctx,
      originalInput: envelope.originalInput,
    });
  }
}

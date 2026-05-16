import type {
  CmsRuntime,
  DeferredHookDispatcher,
  DeferredHookEnvelope,
} from "@aotterclam/mantle-runtime";

/**
 * `DeferredHookDispatcher` impl backed by a Cloudflare Workers Queue
 * binding. Producer side: serialises each `DeferredHookEnvelope` and
 * sends it via `queue.send`. The runtime decorator handles fallback
 * on rejection (its three-rung ladder downgrades to `ctx.waitUntil`
 * → inline-await), so this dispatcher does not retry — it lets the
 * caller decide.
 *
 * Per ADR-0011 only this adapter package may import the CF binding
 * type. The runtime sees only the `DeferredHookDispatcher` port.
 */
export class WorkersQueueHookDispatcher implements DeferredHookDispatcher {
  constructor(private readonly queue: Queue<DeferredHookEnvelope>) {}

  async enqueue(envelope: DeferredHookEnvelope): Promise<void> {
    await this.queue.send(envelope);
  }
}

/**
 * Build the `queue(batch, env, ctx)` Workers handler that consumes
 * `clam_internal` messages and re-fires each `after_*` hook through
 * the runtime. Consumers wire this alongside `fetch` in their default
 * Worker export:
 *
 * ```ts
 * export default {
 *   fetch: app.fetch,
 *   queue: createQueueHandler(cms),
 * } satisfies ExportedHandler<Env>;
 * ```
 *
 * Per-message ack / retry: a thrown handler error retries the
 * message; success acks. CF Queues then handles backoff and the
 * dead-letter queue per the binding's wrangler config.
 */
export function createQueueHandler<Env>(
  cmsRef: { get(): Promise<CmsRuntime> },
): (batch: MessageBatch<DeferredHookEnvelope>, env: Env) => Promise<void> {
  return async (batch, env) => {
    let cms: CmsRuntime;
    try {
      cms = await cmsRef.get();
    } catch (err) {
      // Boot failed (D1 unreachable, manifest invalid, …). Use
      // batch.retryAll so each message's per-message attempt counter
      // increments — letting wrangler's max_retries / DLQ rules
      // engage instead of looping forever at the batch level.
      console.error("[clam-internal] runtime boot failed; retrying batch", err);
      batch.retryAll();
      return;
    }
    // Drain in parallel — after-hooks are independent and CF Queues
    // ack/retry is per-message, so serial processing only burns the
    // 30s consumer wall clock on larger batches.
    await Promise.allSettled(
      batch.messages.map(async (message) => {
        try {
          await cms.runDeferredHook.execute({ envelope: message.body, env });
          message.ack();
        } catch (err) {
          console.error(
            `[clam-internal] consume failed for ${message.body.hook} on ${message.body.schema}/${message.body.entry.id}`,
            err,
          );
          message.retry();
        }
      }),
    );
  };
}

import { describe, expect, it, vi } from "vitest";
import type {
  AfterHookEnvelope,
  CmsRuntime,
} from "@aotterclam/clam-cms-runtime";
import {
  WorkersQueueDurableHookDispatcher,
  createQueueHandler,
} from "../src/bindings/WorkersQueueDurableHookDispatcher.js";

interface CapturedSend<T> {
  body: T;
  options?: unknown;
}

function fakeQueue<T>(): Queue<T> & { captured: CapturedSend<T>[] } {
  const captured: CapturedSend<T>[] = [];
  const queue = {
    captured,
    send: async (body: T, options?: unknown) => {
      captured.push({ body, options });
    },
    sendBatch: async (messages: ReadonlyArray<{ body: T }>) => {
      for (const m of messages) captured.push({ body: m.body });
    },
  } as unknown as Queue<T> & { captured: CapturedSend<T>[] };
  return queue;
}

interface FakeMessage<T> {
  body: T;
  acked: boolean;
  retried: boolean;
}

function fakeBatch<T>(envelopes: T[]): {
  batch: MessageBatch<T>;
  messages: FakeMessage<T>[];
} {
  const messages: FakeMessage<T>[] = envelopes.map((body) => ({
    body,
    acked: false,
    retried: false,
  }));
  const batch = {
    queue: "clam_internal",
    messages: messages.map((m, i) => ({
      id: `msg-${i}`,
      timestamp: new Date(),
      body: m.body,
      attempts: 1,
      ack: () => {
        m.acked = true;
      },
      retry: () => {
        m.retried = true;
      },
    })),
    ackAll: () => {
      for (const m of messages) m.acked = true;
    },
    retryAll: () => {
      for (const m of messages) m.retried = true;
    },
  } as unknown as MessageBatch<T>;
  return { batch, messages };
}

const sampleEnvelope: AfterHookEnvelope = {
  hook: "after_publish",
  schema: "posts",
  entry: {
    id: "post-1",
    collection: "posts",
    status: "published",
    version: 2,
    data: { title: "Hi" },
    authorId: null,
    createdAt: 0,
    updatedAt: 0,
  },
  ctxSnapshot: null,
};

describe("WorkersQueueDurableHookDispatcher.enqueue", () => {
  it("forwards the envelope through queue.send", async () => {
    const queue = fakeQueue<AfterHookEnvelope>();
    const dispatcher = new WorkersQueueDurableHookDispatcher(queue);
    await dispatcher.enqueue(sampleEnvelope);
    expect(queue.captured).toEqual([{ body: sampleEnvelope, options: undefined }]);
  });

  it("propagates queue.send rejections so the runtime ladder downgrades", async () => {
    const queue = {
      send: async () => {
        throw new Error("queue 5xx");
      },
      sendBatch: async () => {},
    } as unknown as Queue<AfterHookEnvelope>;
    const dispatcher = new WorkersQueueDurableHookDispatcher(queue);
    await expect(dispatcher.enqueue(sampleEnvelope)).rejects.toThrow("queue 5xx");
  });
});

describe("createQueueHandler", () => {
  it("ack()s each message after consumeDurableHook resolves", async () => {
    const consumed: { envelope: AfterHookEnvelope; env: unknown }[] = [];
    const cmsRef = {
      get: async (): Promise<CmsRuntime> =>
        ({
          consumeDurableHook: async (envelope: AfterHookEnvelope, env: unknown) => {
            consumed.push({ envelope, env });
          },
        }) as unknown as CmsRuntime,
    };
    const handler = createQueueHandler<{ tag: string }>(cmsRef);
    const { batch, messages } = fakeBatch<AfterHookEnvelope>([sampleEnvelope, sampleEnvelope]);
    await handler(batch, { tag: "env" });
    expect(consumed).toHaveLength(2);
    expect(consumed[0]?.env).toEqual({ tag: "env" });
    expect(messages.every((m) => m.acked)).toBe(true);
    expect(messages.every((m) => !m.retried)).toBe(true);
  });

  it("retryAll()s the batch and increments per-message attempts when cmsRef.get rejects", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cmsRef = {
      get: async (): Promise<CmsRuntime> => {
        throw new Error("d1 unreachable");
      },
    };
    const handler = createQueueHandler<unknown>(cmsRef);
    let retryAllCalled = false;
    const messages = [
      { acked: false, retried: false },
      { acked: false, retried: false },
    ];
    const batch = {
      queue: "clam_internal",
      messages: messages.map((m, i) => ({
        id: `msg-${i}`,
        timestamp: new Date(),
        body: sampleEnvelope,
        attempts: 1,
        ack: () => {
          m.acked = true;
        },
        retry: () => {
          m.retried = true;
        },
      })),
      ackAll: () => {},
      retryAll: () => {
        retryAllCalled = true;
        for (const m of messages) m.retried = true;
      },
    } as unknown as MessageBatch<AfterHookEnvelope>;
    await handler(batch, {});
    expect(retryAllCalled).toBe(true);
    // Per-message ack/retry MUST NOT have been called — the loop never started.
    expect(messages.every((m) => !m.acked)).toBe(true);
    errSpy.mockRestore();
  });

  it("retry()s the message and continues the batch when the hook throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let callCount = 0;
    const cmsRef = {
      get: async (): Promise<CmsRuntime> =>
        ({
          consumeDurableHook: async () => {
            callCount++;
            if (callCount === 1) throw new Error("hook blew up");
          },
        }) as unknown as CmsRuntime,
    };
    const handler = createQueueHandler<unknown>(cmsRef);
    const { batch, messages } = fakeBatch<AfterHookEnvelope>([sampleEnvelope, sampleEnvelope]);
    await handler(batch, {});
    expect(messages[0]?.retried).toBe(true);
    expect(messages[0]?.acked).toBe(false);
    expect(messages[1]?.acked).toBe(true);
    expect(messages[1]?.retried).toBe(false);
    errSpy.mockRestore();
  });
});

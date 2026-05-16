import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCmsRef } from "../src/mount/bootRuntimeOnce.js";
import { mountServerEndpoints } from "../src/mount/mountServerEndpoints.js";
import { InMemoryDatabase } from "../../../clam-cms-runtime/test/fakes/database.js";
import {
  InMemoryKv,
  StubAssetServer,
  stubAuth,
} from "./fakes/runtime-bindings.js";
import type { Auth } from "../src/auth/createAuth.js";

function harness(authOverride?: Partial<Auth>) {
  const auth: Auth = { ...stubAuth, ...authOverride };
  const ref = createCmsRef({
    manifests: [],
    handlers: {},
    bindings: {
      db: new InMemoryDatabase(),
      kv: new InMemoryKv(),
      assets: new StubAssetServer(),
    },
    auth,
  });
  const app = new Hono();
  mountServerEndpoints(app, ref);
  return { app, auth };
}

describe("mountServerEndpoints: /api/auth/* surface", () => {
  it("GET /api/auth/methods returns the registered methods, not the catch-all", async () => {
    const handlerCalls: Request[] = [];
    const { app } = harness({
      methods: [
        { kind: "social", provider: "github" },
        { kind: "magic-link" },
      ],
      handler: async (req) => {
        handlerCalls.push(req);
        return new Response("from-better-auth", { status: 418 });
      },
    });
    const res = await app.request("/api/auth/methods");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({
      methods: [
        { kind: "social", provider: "github" },
        { kind: "magic-link" },
      ],
    });
    expect(handlerCalls).toHaveLength(0);
  });

  it("GET /api/auth/<other> falls through to auth.handler via the SDK-mounted catch-all", async () => {
    const handlerCalls: Request[] = [];
    const { app } = harness({
      handler: async (req) => {
        handlerCalls.push(req);
        return new Response("ok-from-better-auth", { status: 200 });
      },
    });
    const res = await app.request("/api/auth/sign-in/social");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok-from-better-auth");
    expect(handlerCalls).toHaveLength(1);
  });
});

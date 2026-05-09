import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createCmsRef } from "../src/mount/bootRuntimeOnce.js";
import { mountMcp } from "../src/mount/mountMcp.js";
import { mountServerEndpoints } from "../src/mount/mountServerEndpoints.js";
import { InMemoryDatabase } from "../../mantle-runtime/test/fakes/database.js";
import {
  InMemoryKv,
  StubAssetServer,
  stubAuth,
} from "./fakes/runtime-bindings.js";

function harness() {
  const ref = createCmsRef({
    manifests: [],
    bindings: {
      db: new InMemoryDatabase(),
      kv: new InMemoryKv(),
      assets: new StubAssetServer(),
    },
    auth: {
      ...stubAuth,
      handler: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === "/api/auth/.well-known/oauth-authorization-server") {
          return Response.json({
            issuer: url.origin,
            authorization_endpoint: `${url.origin}/api/auth/mcp/authorize`,
            token_endpoint: `${url.origin}/api/auth/mcp/token`,
            scopes_supported: ["openid", "profile", "email", "offline_access", "mcp:read", "mcp:staff"],
          });
        }
        if (url.pathname === "/api/auth/.well-known/oauth-protected-resource") {
          return Response.json({
            resource: url.origin,
            authorization_servers: [url.origin],
            scopes_supported: ["openid", "profile", "email", "offline_access", "mcp:read", "mcp:staff"],
          });
        }
        return new Response(null, { status: 404 });
      },
    },
  });
  const app = new Hono();
  mountServerEndpoints(app, ref);
  mountMcp(app, ref, {
    path: "/staff/mcp",
    surface: "staff",
    requiredScope: "mcp:staff",
  });
  mountMcp(app, ref, {
    path: "/mcp",
    surface: "public",
    requiredScope: "mcp:read",
  });
  return app;
}

describe("MCP OAuth discovery metadata", () => {
  it("points staff challenge at the staff protected resource metadata", async () => {
    const app = harness();

    const res = await app.request("https://site.test/staff/mcp", { method: "POST" });

    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://site.test/staff/mcp/.well-known/oauth-protected-resource"',
    );
    expect(res.headers.get("www-authenticate")).toContain('scope="mcp:staff"');
  });

  it("serves per-route protected resource metadata for staff and public MCP", async () => {
    const app = harness();

    const staff = await app.request("https://site.test/staff/mcp/.well-known/oauth-protected-resource");
    const user = await app.request("https://site.test/mcp/.well-known/oauth-protected-resource");

    await expect(staff.json()).resolves.toMatchObject({
      resource: "https://site.test/staff/mcp",
      authorization_servers: ["https://site.test"],
      jwks_uri: "https://site.test/api/auth/mcp/jwks",
      logo_uri: "https://site.test/favicon.svg",
      scopes_supported: expect.arrayContaining(["mcp:read", "mcp:staff"]),
    });
    await expect(user.json()).resolves.toMatchObject({
      resource: "https://site.test/mcp",
      authorization_servers: ["https://site.test"],
      logo_uri: "https://site.test/favicon.svg",
      scopes_supported: expect.arrayContaining(["mcp:read", "mcp:staff"]),
    });
  });

  it("aliases root OAuth well-known discovery to Better Auth", async () => {
    const app = harness();

    const as = await app.request("https://site.test/.well-known/oauth-authorization-server");
    const prm = await app.request("https://site.test/.well-known/oauth-protected-resource");

    await expect(as.json()).resolves.toMatchObject({
      issuer: "https://site.test",
      token_endpoint: "https://site.test/api/auth/mcp/token",
      logo_uri: "https://site.test/favicon.svg",
      scopes_supported: expect.arrayContaining(["mcp:read", "mcp:staff"]),
    });
    await expect(prm.json()).resolves.toMatchObject({
      resource: "https://site.test",
      authorization_servers: ["https://site.test"],
      logo_uri: "https://site.test/favicon.svg",
      scopes_supported: expect.arrayContaining(["mcp:read", "mcp:staff"]),
    });
  });

  it("serves the SDK favicon for public and admin pages by default", async () => {
    const app = harness();

    const res = await app.request("https://site.test/favicon.svg");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    await expect(res.text()).resolves.toContain("<svg");
  });
});

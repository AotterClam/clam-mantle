/**
 * Unit tests for the RFC 9728 §3.1 path helper. End-to-end
 * verification of the OAuth surface (AS metadata, PRM, /authorize,
 * /token, /register, MCP apiHandlers) lives outside Node-vitest
 * because `@cloudflare/workers-oauth-provider` imports from
 * `cloudflare:workers` which only resolves inside a real Workers
 * runtime. Cover that surface with `wrangler dev` smokes or
 * `@cloudflare/vitest-pool-workers` in a follow-up.
 */
import { describe, expect, it } from "vitest";
import { protectedResourceMetadataPath } from "../src/mount/mountMcp.js";

describe("protectedResourceMetadataPath (RFC 9728 §3.1)", () => {
  it("returns the bare well-known suffix for root resources", () => {
    expect(protectedResourceMetadataPath("")).toBe("/.well-known/oauth-protected-resource");
    expect(protectedResourceMetadataPath("/")).toBe("/.well-known/oauth-protected-resource");
  });

  it("appends the resource path AFTER the well-known suffix", () => {
    expect(protectedResourceMetadataPath("/mcp")).toBe(
      "/.well-known/oauth-protected-resource/mcp",
    );
    expect(protectedResourceMetadataPath("/mcp/staff")).toBe(
      "/.well-known/oauth-protected-resource/mcp/staff",
    );
    expect(protectedResourceMetadataPath("/a/b/c")).toBe(
      "/.well-known/oauth-protected-resource/a/b/c",
    );
  });

  it("normalizes trailing slashes off the resource path", () => {
    expect(protectedResourceMetadataPath("/mcp/")).toBe(
      "/.well-known/oauth-protected-resource/mcp",
    );
    expect(protectedResourceMetadataPath("/mcp/staff///")).toBe(
      "/.well-known/oauth-protected-resource/mcp/staff",
    );
  });

  it("prepends a leading slash if the caller omits it", () => {
    expect(protectedResourceMetadataPath("mcp")).toBe(
      "/.well-known/oauth-protected-resource/mcp",
    );
  });
});

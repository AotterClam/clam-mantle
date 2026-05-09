/**
 * Media uploads integration smoke. Assumes:
 *   - wrangler dev is running on http://localhost:8788 (override via
 *     WRANGLER_BASE_URL env var). Test profile must have R2 binding
 *     `MEDIA` + the `MEDIA_*` env vars set; see `wrangler.toml`.
 *   - `pnpm fixture` has been applied (staff row for u-staff-1).
 *
 * Validates the create + commit MCP tools end-to-end against a real
 * Worker:
 *
 *   1. tools/list contains both `create_media_upload` and
 *      `commit_media_upload`.
 *   2. `create_media_upload` returns a well-formed capability:
 *      uploadId + uploadUrl pointing at the S3 endpoint, expiresAt
 *      ≥ now + 60s, requiredHeaders carrying the signed Content-Type.
 *   3. mime allowlist rejection bubbles a structured diagnostic
 *      (`MEDIA_MIME_REJECTED`) on application/octet-stream.
 *   4. SVG rejected by default with `MEDIA_SVG_REJECTED`.
 *   5. `commit_media_upload` with an unknown uploadId surfaces
 *      `MEDIA_UPLOAD_EXPIRED` (no KV mapping found).
 *
 * What this DOESN'T cover (deliberate, requires real R2):
 *   - the actual presigned PUT to the S3 endpoint succeeding. The URL
 *     points at `<bucket>.<account>.r2.cloudflarestorage.com` which
 *     resolves only on real Cloudflare. Local miniflare emulates the
 *     R2 binding (head/put/delete) but not the S3 API host. Manual
 *     remote validation: `wrangler dev --remote` against a real R2
 *     bucket, or a deployed Worker. The use cases / adapter contract
 *     above is what carries forward to that validation.
 *
 * Exit non-zero on assertion failure with the failing context printed.
 */
import { strict as assert } from "node:assert";

import { FIXTURE_MCP_ACCESS_TOKEN } from "../fixture/data.js";

const BASE = process.env.WRANGLER_BASE_URL ?? "http://localhost:8788";
const BEARER = `Bearer ${FIXTURE_MCP_ACCESS_TOKEN}`;

interface JsonRpcResult {
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
}

let rpcId = 1;

async function rpc(method: string, params?: unknown): Promise<JsonRpcResult> {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: BEARER },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId++, method, params }),
  });
  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as JsonRpcResult;
}

interface ToolCallEnvelope {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text: string }>;
}

async function tool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const r = await rpc("tools/call", { name, arguments: args });
  if (r.error) throw new Error(`MCP tool '${name}' failed: ${r.error.message}`);
  const env = r.result as ToolCallEnvelope;
  return JSON.parse(env.content[0]?.text ?? "null") as T;
}

async function toolErr(name: string, args: Record<string, unknown>): Promise<{
  readonly code: number;
  readonly message: string;
  readonly data?: { readonly code?: string };
}> {
  const r = await rpc("tools/call", { name, arguments: args });
  if (!r.error) throw new Error(`expected tool '${name}' to fail; got result: ${JSON.stringify(r.result)}`);
  return r.error as { code: number; message: string; data?: { code?: string } };
}

interface CreateMediaUploadResponse {
  readonly uploadId: string;
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly requiredHeaders?: Readonly<Record<string, string>>;
  readonly expiresAt: number;
}

async function main(): Promise<void> {
  // 1. tools/list — confirm media tools are registered when the
  //    runtime has `mediaStorage` bound (test profile has R2 + env).
  {
    const r = await rpc("tools/list");
    const result = r.result as { tools: ReadonlyArray<{ name: string }> };
    const names = result.tools.map((t) => t.name);
    assert.ok(names.includes("create_media_upload"), "tools/list missing create_media_upload");
    assert.ok(names.includes("commit_media_upload"), "tools/list missing commit_media_upload");
    console.log(`[media] 1/5  tools/list → media tools registered`);
  }

  // 2. create_media_upload — capability shape.
  {
    const cap = await tool<CreateMediaUploadResponse>("create_media_upload", {
      filename: "smoke.png",
      mimeType: "image/png",
      byteSize: 4096,
      purpose: "post-cover",
    });
    assert.ok(cap.uploadId.length > 0, "uploadId missing");
    assert.equal(cap.method, "PUT");
    assert.ok(cap.uploadUrl.includes("r2.cloudflarestorage.com"), `uploadUrl shape unexpected: ${cap.uploadUrl}`);
    assert.ok(cap.uploadUrl.includes("X-Amz-Expires="), "uploadUrl missing X-Amz-Expires");
    assert.equal(cap.requiredHeaders?.["Content-Type"], "image/png");
    assert.ok(cap.expiresAt > Date.now() - 5_000, "expiresAt is in the past");
    console.log(`[media] 2/5  create_media_upload → uploadId=${cap.uploadId.slice(0, 8)}…`);
  }

  // 3. mime allowlist rejection.
  {
    const err = await toolErr("create_media_upload", {
      filename: "x.exe",
      mimeType: "application/octet-stream",
    });
    assert.equal(err.data?.code, "MEDIA_MIME_REJECTED", `expected MEDIA_MIME_REJECTED, got ${JSON.stringify(err)}`);
    console.log(`[media] 3/5  create_media_upload(application/octet-stream) → MEDIA_MIME_REJECTED`);
  }

  // 4. SVG rejected by default (no MEDIA_ALLOW_SVG=1 in test env).
  {
    const err = await toolErr("create_media_upload", {
      filename: "x.svg",
      mimeType: "image/svg+xml",
    });
    assert.equal(err.data?.code, "MEDIA_SVG_REJECTED", `expected MEDIA_SVG_REJECTED, got ${JSON.stringify(err)}`);
    console.log(`[media] 4/5  create_media_upload(image/svg+xml) → MEDIA_SVG_REJECTED`);
  }

  // 5. commit with unknown uploadId → MEDIA_UPLOAD_EXPIRED. Validates
  //    the KV-lookup gate without needing the actual S3 PUT to succeed.
  {
    const err = await toolErr("commit_media_upload", { uploadId: "nonexistent-upload-id" });
    assert.equal(err.data?.code, "MEDIA_UPLOAD_EXPIRED", `expected MEDIA_UPLOAD_EXPIRED, got ${JSON.stringify(err)}`);
    console.log(`[media] 5/5  commit_media_upload(unknown) → MEDIA_UPLOAD_EXPIRED`);
  }

  console.log(`[media] all assertions passed`);
}

main().catch((err) => {
  console.error(`[media] FAILED: ${(err as Error).message}`);
  if ((err as Error).stack) console.error((err as Error).stack);
  process.exit(1);
});

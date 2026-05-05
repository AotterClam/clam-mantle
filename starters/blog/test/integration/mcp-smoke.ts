/**
 * MCP integration smoke. Assumes:
 *   - wrangler dev is running on http://localhost:8787 (override via
 *     WRANGLER_BASE_URL env var)
 *   - `pnpm fixture` has been applied (3 posts × 2 locales seeded)
 *
 * Exercises the full MCP JSON-RPC surface against a real worker:
 * initialize → tools/list → tools/call for each of the 6 v0.1.0
 * tools, plus a few error paths. Each call hits the runtime's
 * chokepoint, so lifecycle hooks fire alongside (verified by the
 * contact-messages create case).
 *
 * Catches integration bugs that in-process Hono unit tests miss:
 * miniflare-D1 SQL quirks, KV write semantics, oauth verifier
 * wiring, JSON-RPC envelope shapes.
 *
 * Exit non-zero on any assertion failure with the failing context
 * printed; CI surfaces this as a job failure.
 */
import { strict as assert } from "node:assert";

const BASE = process.env.WRANGLER_BASE_URL ?? "http://localhost:8787";
const BEARER = "Bearer dev-u-staff-1";

interface JsonRpcResult {
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string };
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
  if (r.error) {
    throw new Error(`MCP tool '${name}' failed: ${r.error.message}`);
  }
  const env = r.result as ToolCallEnvelope;
  const text = env.content[0]?.text ?? "null";
  return JSON.parse(text) as T;
}

interface EntryRow {
  readonly id: string;
  readonly collection: string;
  readonly status: string;
  readonly version: number;
  readonly data: Record<string, unknown>;
}

async function main(): Promise<void> {
  // Unique slug per run so re-runs don't collide on the posts schema.
  const runSlug = `mcp-test-${Date.now()}`;

  // 1. initialize handshake
  {
    const r = await rpc("initialize");
    const result = r.result as { protocolVersion?: string };
    assert.ok(result.protocolVersion, "initialize missing protocolVersion");
    console.log(`[mcp]  1/12  initialize → ${result.protocolVersion}`);
  }

  // 2. tools/list — assert generic tools + per-collection authoring
  //    tools for each Schema in the starter (5 schemas: posts,
  //    post-translations, pages, page-translations, contact-messages
  //    → 10 per-collection tools).
  {
    const r = await rpc("tools/list");
    const result = r.result as { tools: ReadonlyArray<{ name: string }> };
    const names = result.tools.map((t) => t.name).sort();
    const expected = [
      "archive_entry",
      "create_draft_contact_messages",
      "create_draft_page_translations",
      "create_draft_pages",
      "create_draft_post_translations",
      "create_draft_posts",
      "get_entry",
      "list_entries",
      "request_publish",
      "update_draft_contact_messages",
      "update_draft_page_translations",
      "update_draft_pages",
      "update_draft_post_translations",
      "update_draft_posts",
    ];
    assert.deepEqual(names, expected, `tools/list mismatch: got ${names.join(",")}`);
    console.log(
      `[mcp]  2/12  tools/list → ${names.length} tools (4 generic + 10 per-collection)`,
    );
  }

  // 3. list_entries on post-translations — fixture seeded 6 rows
  {
    const rows = await tool<readonly EntryRow[]>("list_entries", {
      collection: "post-translations",
    });
    assert.equal(rows.length, 6, `expected 6 fixture post-translations, got ${rows.length}`);
    console.log(`[mcp]  3/12  list_entries(post-translations) → 6 rows`);
  }

  // 4. get_entry on a known fixture id (en + zh-TW translations of
  //    hello-world both exist; pick en)
  {
    const row = await tool<EntryRow>("get_entry", { id: "fx-pt-hello-world-en" });
    assert.equal(row.collection, "post-translations");
    assert.equal((row.data as { title: string }).title, "Hello, world");
    console.log(`[mcp]  4/12  get_entry(fx-pt-hello-world-en) → "Hello, world"`);
  }

  // 5. create_draft_posts — agent sends Schema fields at top level
  //    (no `{ data: ... }` wrapper; that's the new typed surface).
  let postId: string;
  {
    const row = await tool<EntryRow>("create_draft_posts", {
      slug: runSlug,
      coverUrl: "https://example.com/x.jpg",
    });
    assert.equal(row.collection, "posts");
    assert.equal(row.status, "draft");
    assert.equal(row.version, 1);
    postId = row.id;
    console.log(`[mcp]  5/12  create_draft_posts → ${postId}`);
  }

  // 6. update_draft_posts with correct OCC → version bump
  {
    const row = await tool<EntryRow>("update_draft_posts", {
      id: postId,
      expected_version: 1,
      slug: runSlug,
      coverUrl: "https://example.com/y.jpg",
    });
    assert.equal(row.version, 2, `expected version 2 after update, got ${row.version}`);
    console.log(`[mcp]  6/12  update_draft_posts(${postId}) → version 2`);
  }

  // 7. update_draft_posts with stale OCC → CONFLICT
  {
    let caught: Error | null = null;
    try {
      await tool("update_draft_posts", {
        id: postId,
        expected_version: 1,
        slug: runSlug,
      });
    } catch (e) {
      caught = e as Error;
    }
    assert.ok(caught, "expected stale-OCC update to throw");
    assert.match(caught.message, /CONFLICT|expected_version|version/i);
    console.log(`[mcp]  7/12  update_draft_posts stale OCC → CONFLICT`);
  }

  // 8. request_publish → status flips to published, fires before_publish
  //    + after_publish hooks (none bound on posts; clean path)
  {
    const row = await tool<EntryRow>("request_publish", { id: postId });
    assert.equal(row.status, "published");
    console.log(`[mcp]  8/12  request_publish(${postId}) → published`);
  }

  // 9. archive_entry — status flips to archived, version bumps again
  {
    const row = await tool<EntryRow>("archive_entry", {
      id: postId,
      expected_version: 3,
    });
    assert.equal(row.status, "archived");
    assert.equal(row.version, 4);
    console.log(`[mcp]  9/12  archive_entry(${postId}) → archived (v4)`);
  }

  // 10. create_draft_contact_messages — exercises the lifecycle hook
  //     chain. The captcha hook bypasses authenticated callers (MCP +
  //     admin), so no token needed; after_create logs to console.info.
  let contactId: string;
  {
    const row = await tool<EntryRow>("create_draft_contact_messages", {
      name: "MCP Tester",
      email: "mcp@example.com",
      message: "Hello via MCP",
    });
    assert.equal(row.collection, "contact-messages");
    assert.equal(row.status, "draft");
    contactId = row.id;
    console.log(`[mcp] 10/12  create_draft_contact_messages + hooks → ${contactId}`);
  }

  // 11. tools/call on a Schema-named tool that doesn't exist → -32601
  {
    let caught: Error | null = null;
    try {
      await tool("create_draft_ghost", { name: "x" });
    } catch (e) {
      caught = e as Error;
    }
    assert.ok(caught, "expected unknown-collection tool to throw");
    assert.match(caught.message, /unknown tool/i);
    console.log(`[mcp] 11/12  create_draft_ghost → unknown tool (-32601)`);
  }

  // 12. list_entries with status filter
  {
    const drafts = await tool<readonly EntryRow[]>("list_entries", {
      collection: "contact-messages",
      status: "draft",
    });
    assert.ok(
      drafts.some((r) => r.id === contactId),
      `contactId ${contactId} not in draft list`,
    );
    console.log(`[mcp] 12/12  list_entries(contact-messages, status=draft) → contains new row`);
  }

  console.log(`\n[mcp] all integration checks passed.`);
}

main().catch((err) => {
  console.error(`\n[mcp] FAILED:`, err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});

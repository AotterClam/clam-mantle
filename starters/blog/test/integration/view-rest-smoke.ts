/**
 * Public View REST integration smoke (ADR-0012). Assumes:
 *   - wrangler dev on http://localhost:8787 (override via WRANGLER_BASE_URL)
 *   - `pnpm fixture` applied (3 posts × 2 locales seeded)
 *
 * Exercises every shape in ADR-0012 against a real worker:
 *   1.  static View (no params)
 *   2.  param-driven View (?locale=)
 *   3.  pagination (?page=&show=)
 *   4.  show clamp at View.spec.limit
 *   5.  hasMore boundary semantics
 *   6.  required-param missing → 400 INPUT_VALIDATION_FAILED
 *   7.  unknown View name → 404
 *   8.  unknown query param silently ignored (lenient v0.1.0)
 *   9.  envelope shape (`{ rows, page, show, hasMore }`, no `entries`)
 *  10.  reserved-name collision NOT possible at runtime (parser gate)
 *
 * Catches integration bugs that in-process Hono unit tests miss:
 * miniflare-D1 OFFSET/LIMIT semantics, JSON1 json_extract behaviour
 * on the param-substituted column path, and CF Workers query-string
 * decoding. Exit non-zero on any assertion failure with the failing
 * context printed; CI surfaces this as a job failure.
 */
import { strict as assert } from "node:assert";

const BASE = process.env.WRANGLER_BASE_URL ?? "http://localhost:8787";

interface ViewEnvelope<R = Record<string, unknown>> {
  readonly ok: true;
  readonly data: {
    readonly rows: readonly R[];
    readonly page: number;
    readonly show: number;
    readonly hasMore: boolean;
  };
}

interface ErrorEnvelope {
  readonly ok: false;
  readonly diagnostic: { readonly code: string; readonly message: string };
}

async function getView<R = Record<string, unknown>>(
  path: string,
): Promise<{ status: number; body: ViewEnvelope<R> | ErrorEnvelope }> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body: ViewEnvelope<R> | ErrorEnvelope;
  try {
    body = JSON.parse(text) as ViewEnvelope<R> | ErrorEnvelope;
  } catch {
    throw new Error(`GET ${path}: non-JSON body (status ${res.status}): ${text.slice(0, 200)}`);
  }
  return { status: res.status, body };
}

function assertOk<R>(
  body: ViewEnvelope<R> | ErrorEnvelope,
  ctx: string,
): asserts body is ViewEnvelope<R> {
  if (!body.ok) {
    throw new Error(`${ctx}: expected ok envelope, got ${JSON.stringify(body)}`);
  }
}

interface PostTranslation {
  readonly slug: string;
  readonly locale: string;
  readonly title: string;
  readonly updatedAt?: number;
}

async function main(): Promise<void> {
  // 1. recent-posts: static View, fixture seeds 3 posts × 2 locales.
  {
    const r = await getView<PostTranslation>("/api/views/recent-posts");
    assert.equal(r.status, 200);
    assertOk(r.body, "[1] recent-posts");
    assert.equal(r.body.data.rows.length, 6, "recent-posts should return all 6 fixture rows");
    assert.equal(r.body.data.page, 1);
    assert.equal(r.body.data.show, 20, "recent-posts.spec.limit = 20");
    assert.equal(r.body.data.hasMore, false);
    // Schema-property fields project as data.<field>; reserved metadata
    // (updatedAt) projects as the aliased reserved column.
    const first = r.body.data.rows[0]!;
    assert.equal(typeof first.slug, "string");
    assert.equal(typeof first.locale, "string");
    assert.equal(typeof first.title, "string");
    console.log(`[view] 1/10  GET /api/views/recent-posts → 6 rows, hasMore=false`);
  }

  // 2. posts-by-locale: required ?locale= filters down the same set.
  {
    const r = await getView<PostTranslation>("/api/views/posts-by-locale?locale=zh-TW");
    assert.equal(r.status, 200);
    assertOk(r.body, "[2] posts-by-locale zh-TW");
    assert.equal(r.body.data.rows.length, 3, "expect 3 zh-TW translations");
    for (const row of r.body.data.rows) {
      assert.equal(row.locale, "zh-TW", `row ${row.slug} leaked non-zh-TW locale`);
    }
    console.log(`[view] 2/10  GET /api/views/posts-by-locale?locale=zh-TW → 3 rows`);
  }

  // 3. Pagination: page=1,show=2 + page=2,show=2 cover disjoint slices.
  {
    const r1 = await getView<PostTranslation>("/api/views/posts-by-locale?locale=en&show=2&page=1");
    assertOk(r1.body, "[3a] page=1");
    assert.equal(r1.body.data.rows.length, 2);
    assert.equal(r1.body.data.page, 1);
    assert.equal(r1.body.data.show, 2);
    assert.equal(r1.body.data.hasMore, true, "first page of 3 with show=2 should signal more");

    const r2 = await getView<PostTranslation>("/api/views/posts-by-locale?locale=en&show=2&page=2");
    assertOk(r2.body, "[3b] page=2");
    assert.equal(r2.body.data.rows.length, 1, "second page of 3 with show=2 has 1 row");
    assert.equal(r2.body.data.page, 2);
    assert.equal(r2.body.data.hasMore, false, "rows.length < show ⇒ hasMore=false");

    const slugs1 = r1.body.data.rows.map((r) => r.slug);
    const slugs2 = r2.body.data.rows.map((r) => r.slug);
    for (const s of slugs2) {
      assert.ok(!slugs1.includes(s), `page=2 leaked slug '${s}' from page=1`);
    }
    console.log(`[view] 3/10  pagination — page=1 [${slugs1.join(",")}] disjoint from page=2 [${slugs2.join(",")}]`);
  }

  // 4. show clamp: ?show=10000 trimmed to View.spec.limit (100 here).
  {
    const r = await getView<PostTranslation>("/api/views/posts-by-locale?locale=en&show=10000");
    assertOk(r.body, "[4] show clamp");
    assert.equal(r.body.data.show, 100, "show clamps to View.spec.limit");
    assert.ok(r.body.data.rows.length <= 100);
    console.log(`[view] 4/10  ?show=10000 → clamped to 100 (View.spec.limit)`);
  }

  // 5. hasMore boundary: when rows.length < show, hasMore must be false.
  {
    const r = await getView<PostTranslation>("/api/views/posts-by-locale?locale=en&show=20");
    assertOk(r.body, "[5] hasMore boundary");
    assert.ok(r.body.data.rows.length < r.body.data.show);
    assert.equal(r.body.data.hasMore, false);
    console.log(`[view] 5/10  rows < show ⇒ hasMore=false`);
  }

  // 6. Missing required param → 400 INPUT_VALIDATION_FAILED.
  {
    const r = await getView("/api/views/posts-by-locale");
    assert.equal(r.status, 400);
    assert.equal(r.body.ok, false);
    if (r.body.ok) throw new Error("unreachable");
    assert.equal(r.body.diagnostic.code, "INPUT_VALIDATION_FAILED");
    assert.match(r.body.diagnostic.message, /locale/);
    console.log(`[view] 6/10  missing required ?locale= → 400 INPUT_VALIDATION_FAILED`);
  }

  // 7. Unknown View name → 404.
  {
    const r = await fetch(`${BASE}/api/views/this-view-does-not-exist`);
    assert.equal(r.status, 404);
    console.log(`[view] 7/10  unknown View → 404`);
  }

  // 8. Unknown query param silently ignored (lenient v0.1.0).
  {
    const r = await getView<PostTranslation>(
      "/api/views/posts-by-locale?locale=en&unknown=ignored&junk=42",
    );
    assertOk(r.body, "[8] unknown params");
    assert.ok(r.body.data.rows.length > 0);
    console.log(`[view] 8/10  unknown query keys silently ignored`);
  }

  // 9. Envelope shape: data is { rows, page, show, hasMore } — never
  //    the legacy { items, nextCursor } (was rewritten in ADR-0012).
  //    Asserting the negative shape catches future regressions.
  {
    const r = await getView<PostTranslation>("/api/views/recent-posts");
    assertOk(r.body, "[9] envelope shape");
    const data = r.body.data as Record<string, unknown>;
    assert.ok("rows" in data, "envelope must carry data.rows");
    assert.ok("page" in data, "envelope must carry data.page");
    assert.ok("show" in data, "envelope must carry data.show");
    assert.ok("hasMore" in data, "envelope must carry data.hasMore");
    assert.ok(!("items" in data), "envelope must NOT carry legacy data.items");
    assert.ok(!("nextCursor" in data), "envelope must NOT carry legacy data.nextCursor");
    assert.ok(!("entries" in data), "envelope rows are 'rows', not 'entries' — ADR-0012");
    console.log(`[view] 9/10  envelope = { rows, page, show, hasMore } (no legacy keys)`);
  }

  // 10. Reserved name (page) cannot reach the runtime — the parser
  //     would have rejected the manifest. We can't synthesise that
  //     locally without restarting the worker, so we assert the
  //     reverse: passing ?page= still parses cleanly as pagination
  //     (proves the runtime owns the reserved name end-to-end).
  {
    const r = await getView<PostTranslation>(
      "/api/views/recent-posts?page=2&show=2",
    );
    assertOk(r.body, "[10] reserved-name plumbing");
    assert.equal(r.body.data.page, 2, "?page= must be honoured by the runtime, not param-coerced");
    assert.equal(r.body.data.show, 2);
    console.log(`[view] 10/10 reserved ?page= / ?show= honoured by runtime`);
  }

  console.log(`\n[view] all View REST integration checks passed.`);
}

main().catch((err) => {
  console.error(`\n[view] FAILED:`, err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});

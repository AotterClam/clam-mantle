# `@aotter/starter-blog`

Reference starter for mantle v0.1.0. Wraps the runtime + Cloudflare
adapter into a runnable Worker with three Schemas (posts, post-translations,
contact-messages) and a public read path served from KV.

## What it exercises

- **Localized posts via `translates`** — `posts` is language-neutral
  (slug, cover image, author, publish time); `post-translations`
  carries per-locale title + body and joins on `slug`. ADR-0010 cross-
  Schema invariants run at boot.
- **Builtin Procedure** — `submit-contact` declares
  `handler.kind: builtin`, `op: create`, `schema: contact-messages`.
  The runtime projects input, stamps `x-mantle-bind: now`, drops side-
  channel fields (CAPTCHA token), routes through the entry-writer
  chokepoint.
- **Lifecycle hooks** — `before_create` on `contact-messages` runs a
  CAPTCHA-check Procedure (`errorPolicy: abort`); `after_create` runs
  a Slack-notify Procedure (default `errorPolicy: continue`, rides
  `ctx.waitUntil` when CF supplies it).
- **Render pipeline** — entry HTML + per-locale `llms.txt` are written
  to KV at publish time by `HtmlPublishOrchestrator`. The starter
  serves them directly via a small KV-read handler in `src/index.ts`.

## What it does NOT do (deferred)

- **Member system** (end-user login, signup, password). Comments are
  the contact form's anonymous-with-email pattern — no member auth.
  Lands in v0.2.
- **Editorial lifecycle** (approval queue). Schemas use `lifecycle:
  simple` only. Editorial runtime lands in v0.1.x.
- **R2 media uploads**. `posts.coverUrl` is a hand-supplied URL string
  for now. UI picker + R2 upload land in v0.1.x.
- **Admin SPA** (commit 5). Until that ships, content is seeded via
  `pnpm seed`.

## Quickstart

```bash
# From the repo root, install workspace deps + build the runtime:
pnpm install
pnpm -r --filter '@aotter/mantle-spec' --filter '@aotter/mantle-runtime' --filter '@aotter/mantle-cloudflare' build

# Then in starters/blog/:
cd starters/blog

# Apply the test fixture FIRST. It runs canonical migrations,
# writes site_config + 3 posts × 2 locales to D1, plus pre-rendered
# HTML + per-locale llms.txt to KV so the public read path works
# without an admin publish flow:
pnpm fixture

# Then run wrangler dev:
pnpm dev
```

The fixture re-runs cleanly while `wrangler dev` is up too — the
migrations are `IF NOT EXISTS` and inserts use `OR IGNORE`, so
edits to fixture text or templates land on subsequent applies.

Run order matters because `wrangler dev`'s D1 lives in memory
unless the fixture has populated `.wrangler/state` first; without
fixture data, every page returns 404.

## Smoke test (curl)

```bash
# Public read — pre-rendered HTML from KV:
curl -i http://localhost:8787/en/posts/hello-world
curl -i http://localhost:8787/zh-TW/posts/hello-world

# Per-locale post list:
curl -i http://localhost:8787/en/posts

# llms.txt:
curl -i http://localhost:8787/llms.txt
curl -i http://localhost:8787/en/llms.txt

# Contact form happy path (CAPTCHA passes):
curl -i -X POST http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Alice","email":"a@example.com","message":"Hi","recaptchaToken":"tok-pass"}'

# Contact form CAPTCHA fail path (the stub rejects token === "fail").
# Expect HTTP 403 with `{ ok: false, diagnostic: { code: AUTH_DENIED, ... } }`:
curl -i -X POST http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Bot","email":"b@example.com","message":"spam","recaptchaToken":"fail"}'

# MCP /mcp:
curl -i -X POST http://localhost:8787/mcp \
  -H 'authorization: Bearer dev-u-staff-1' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

`pnpm fixture` renders pre-published HTML for each post-translation
+ each per-locale list and writes both to KV alongside the D1 inserts
— the public read path serves immediately, no admin publish flow
required. The fixture is idempotent (D1 inserts use `OR IGNORE`; KV
puts overwrite). Re-running picks up edits to fixture text or to the
templates.

## Files

```
manifests/        # YAML: posts + post-translations + contact (Schemas, Procedures, Triggers, Views)
src/
  index.ts        # worker entrypoint — Hono routes + KV public reader
  mantleConfig.ts   # builds CmsConfig from env
  loadManifests.ts# parses YAML at module-load (Wrangler [[rules]] type=Text)
  handlers/       # ref handlers (CAPTCHA stub, Slack stub)
  templates/      # hono/jsx HTML for entry + list + binding
test/fixture/
  data.ts         # fixture posts + translations + site config
  apply.ts        # renders templates, emits .fixture.sql + .fixture.kv.json,
                  # runs `wrangler d1 execute` + `wrangler kv bulk put`
wrangler.toml     # local D1 + KV bindings; MANTLE_ALLOW_STUB_OAUTH=1
.dev.vars.example # committed; .dev.vars itself stays gitignored
```

## Production checklist

Before deploying THIS starter as-is:

1. Replace `StubOAuthVerifier` with a real `@cloudflare/workers-oauth-provider` verifier and remove `MANTLE_ALLOW_STUB_OAUTH` from vars.
2. Replace `captchaCheck` with a real Turnstile / hCaptcha siteverify call.
3. Replace `slackNotify` with your Slack webhook (or a different sink).
4. Replace `posts.coverUrl` images with assets you own (the fixture uses Unsplash for demo).
5. Bind a real D1 database + KV namespace in `wrangler.toml` and run migrations against it (boot does this automatically on first request, but pre-creating the tables via `wrangler d1 migrations apply` is also fine).
6. Don't ship `test/fixture/` to production — it's demo content for local dev.

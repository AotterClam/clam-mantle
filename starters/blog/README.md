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

# Seed the local D1 with site_config + 3 posts × 2 locales:
pnpm seed > .seed.sql
wrangler d1 execute mantle-blog-local --local --file=.seed.sql

# Run wrangler dev (http://localhost:8787):
pnpm dev
```

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

# Contact form CAPTCHA fail path (the stub rejects token === "fail"):
curl -i -X POST http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Bot","email":"b@x","message":"spam","recaptchaToken":"fail"}'

# MCP /mcp:
curl -i -X POST http://localhost:8787/mcp \
  -H 'authorization: Bearer dev-u-staff-1' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

The HTML public-read path requires the publish pipeline to have run.
For seeded data this happens at first request that needs the rendered
artifact — the seed script inserts entries in `published` status, but
the first GET to a post URL may return 404 until you trigger a re-
publish via admin UI (commit 5). Until then exercise via MCP
`tools/call request_publish` or extend the seed to write entry HTML
to KV directly.

## Files

```
manifests/        # YAML: posts + post-translations + contact (Schemas, Procedures, Triggers, Views)
src/
  index.ts        # worker entrypoint — Hono routes + KV public reader
  mantleConfig.ts   # builds CmsConfig from env
  loadManifests.ts# parses YAML at module-load (Wrangler bundles via ?raw)
  handlers/       # ref handlers (CAPTCHA stub, Slack stub)
  templates/      # hono/jsx HTML for entry + list + binding
seed/seed.ts      # idempotent dev seed (site_config + posts + translations)
wrangler.toml     # local D1 + KV bindings; MANTLE_ALLOW_STUB_OAUTH=1
.dev.vars         # mirrors wrangler.toml vars; gitignored in real projects
```

## Production checklist

Before deploying THIS starter as-is:

1. Replace `StubOAuthVerifier` with a real `@cloudflare/workers-oauth-provider` verifier and remove `MANTLE_ALLOW_STUB_OAUTH` from vars.
2. Replace `captchaCheck` with a real Turnstile / hCaptcha siteverify call.
3. Replace `slackNotify` with your Slack webhook (or a different sink).
4. Replace `posts.coverUrl` images with assets you own (the seed uses Unsplash for demo).
5. Bind a real D1 database + KV namespace in `wrangler.toml` and run migrations against it (boot does this automatically on first request, but pre-creating the tables via `wrangler d1 migrations apply` is also fine).

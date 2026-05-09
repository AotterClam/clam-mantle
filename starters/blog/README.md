# `@aotter/starter-blog`

Reference starter for mantle v0.1.0. Wraps the runtime + Cloudflare
adapter into a runnable Worker with three Schemas (posts, post-translations,
contact-messages) and a public read path served from KV.

This starter is intentionally fixed-manifest during bootstrap. The
first-run installer should ask for public copy and seed home/about/
contact/welcome content, not redesign the Schema/View/Procedure/
Trigger model. Custom workflow design belongs in `starters/blank` or
a later dedicated starter.

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
- **First-party media hosting**. `posts.coverUrl` is a hand-supplied
  URL string marked with `x-mcp-hint: media-image` for agents/admin UI.
  R2-backed uploads are an explicit opt-in add-on, not part of first-run
  provisioning.
- **Full admin SPA**. v0.1.0 ships a minimal owner landing at `/admin`.
  First public content is seeded by `pnpm run seed:initial`; ongoing
  content operations use MCP after owner bootstrap.

## Quickstart

```bash
pnpm install
cp .dev.vars.example .dev.vars

# Option A: local demo fixture for development/testing.
pnpm fixture       # seeds dev D1/KV with demo content (no staff row)

# Then run wrangler dev:
pnpm dev
```

The public site (rendered blog routes, contact form, MCP transport
auth) is already runnable at this point — no OAuth setup required.

### Signing in at /admin

`/admin` uses real GitHub OAuth even locally — there is no stub for the
browser redirect flow. One-time setup:

1. **Create a GitHub OAuth App** at <https://github.com/settings/developers>:
   - **Homepage URL**: `http://localhost:8787`
   - **Callback URL**: `http://localhost:8787/admin/auth/github/callback`
2. **Edit `.dev.vars`** (created above from `.dev.vars.example`):
   ```
   GITHUB_CLIENT_ID=<the_client_id>
   GITHUB_CLIENT_SECRET=<the_client_secret>
   ADMIN_GITHUB_LOGIN=<your_github_login>
   ```
3. **Restart `pnpm dev`** so wrangler picks up the new vars.
4. Visit <http://localhost:8787/admin> and sign in with the GitHub
   account whose login matches `ADMIN_GITHUB_LOGIN`. The runtime's
   `ensureBootstrapOwner` promotes that first user to `owner`
   automatically — the dev fixture intentionally leaves the staff
   table empty so this bootstrap fires.

The fixture re-runs cleanly while `wrangler dev` is up too — the
migrations are `IF NOT EXISTS` and inserts use `OR IGNORE`, so
edits to fixture text or templates land on subsequent applies.

Run order matters because `wrangler dev`'s D1 lives in memory
unless the fixture has populated `.wrangler/state` first; without
fixture data, every page returns 404.

### Integration smokes

```bash
cp .dev.vars.test.example .dev.vars.test   # one-time, gitignored
pnpm test:integration
```

`pnpm test:integration` orchestrates the test profile end-to-end:
spawns wrangler with `--env test --persist-to .wrangler-test --port 8788`,
applies the test fixture (which **does** pre-seed
`staff(u-staff-1, editor)` so `Bearer dev-u-staff-1` reaches the
role-gated MCP/View paths — that's exactly what should NOT happen on
the dev profile), runs both smokes against port 8788, then tears
wrangler down.

The test profile has its own miniflare state (`.wrangler-test/`) and
its own port (8788), so it never collides with `pnpm dev` running on
the default profile (`.wrangler/`, port 8787). Both can run in
parallel.

For production onboarding, do not run the fixture. The install Skill
asks for public copy, writes `initial-seed.json`, and provision applies
it directly to remote D1/KV:

```bash
pnpm run seed:initial -- --seed-file initial-seed.json --origin "<worker_url>" --remote
```

The seed writes home/about/contact/welcome entries to D1 and rendered
HTML, markdown mirrors, post lists, and `llms.txt` to KV. It is the
only first-run direct-D1 content path; after owner sign-in, MCP handles
normal content operations.

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

# Public View REST surface (ADR-0012). Every parsed View auto-mounts:
#   - recent-posts: static (no params)
#   - posts-by-locale: required ?locale= param
curl -s http://localhost:8787/api/views/recent-posts | jq '.data | {rows: .rows | length, page, show, hasMore}'
curl -s 'http://localhost:8787/api/views/posts-by-locale?locale=zh-TW' | jq '.data.rows[] | {slug, title}'
curl -s 'http://localhost:8787/api/views/posts-by-locale?locale=en&page=1&show=2' | jq '.data | {page, show, hasMore, count: .rows | length}'

# Contact form happy path (CAPTCHA passes):
curl -i -X POST http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Alice","email":"a@example.com","message":"Hi","turnstileToken":"tok-pass"}'

# Contact form CAPTCHA fail path (the stub rejects token === "fail").
# Expect HTTP 403 with `{ ok: false, diagnostic: { code: AUTH_DENIED, ... } }`:
curl -i -X POST http://localhost:8787/api/contact \
  -H 'content-type: application/json' \
  -d '{"name":"Bot","email":"b@example.com","message":"spam","turnstileToken":"fail"}'

# MCP /mcp transport handshake. `Bearer dev-<user_id>` is StubOAuthVerifier's
# happy path; `initialize` is role-free so it works on the dev profile.
# Anything that touches a role-gated tool (tools/call) requires either
# (a) running against the test profile via `pnpm test:integration` (which
# pre-seeds u-staff-1 as editor), or (b) manually inserting a staff row
# for the user_id you embed in the Bearer token.
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
  theme.default/  # hono/jsx HTML for entry/list/home/contact + chrome
scripts/
  seed-initial-content.ts # renders initial-seed.json into D1 SQL + KV bulk puts
  run-integration.mjs     # spawns wrangler --env test --persist-to .wrangler-test,
                          # applies test fixture, runs smokes, tears down
test/fixture/
  data.ts            # fixture posts + translations + site config
  apply-shared.ts    # SQL/KV builder + applyFixture(opts) entrypoint
  apply-dev.ts       # `pnpm fixture` — dev seed (no staff row;
                     # `ensureBootstrapOwner` fires for first OAuth login)
  apply-test.ts      # `pnpm test:integration` setup — same content +
                     # staff(u-staff-1, editor) row, targets test profile
test/integration/
  mcp-smoke.ts       # MCP JSON-RPC smoke (Bearer dev-u-staff-1)
  view-rest-smoke.ts # public-read smoke
wrangler.toml          # default env: local D1 + KV bindings; MANTLE_ALLOW_STUB_OAUTH=1
                       # [env.test]: separate bindings, port 8788
.dev.vars.example      # committed; .dev.vars itself stays gitignored
.dev.vars.test.example # committed; .dev.vars.test loaded by wrangler --env test
```

## Production checklist

Before deploying THIS starter as-is:

1. Remove `MANTLE_ALLOW_STUB_OAUTH` from deployable vars; production uses GitHub OAuth + Workers OAuth Provider.
2. Replace `captchaCheck` with a real Turnstile / hCaptcha siteverify call.
3. Replace `slackNotify` with your Slack webhook (or a different sink).
4. Replace demo Unsplash cover images with assets you own when appropriate,
   or keep using external image URLs until first-party media hosting is enabled.
5. Bind real D1, render KV, and OAuth KV namespaces in `wrangler.toml`; boot applies runtime migrations on first request.
6. Don't run `test/fixture/` against production — it is demo content for local dev.

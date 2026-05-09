# `@aotter/starter-publication`

Reference `publication` starter for mantle v0.1.0 — the
owner-published-content family in the starter taxonomy (#58). Covers
landing pages, articles, docs-lite, project updates, and basic contact
capture. Not for inventory / order workflows (`micro-shop`), lead
qualification pipelines (`leads-inbox`), member-created content
(`community`), or private/paid creator content (`fan-club`).

It wraps the runtime + Cloudflare adapter into a runnable Worker with
three Schemas (posts, post-translations, contact-messages) and a
public read path served from KV. Schema-level names (`posts`,
`/posts` route, MCP tool names) are intentionally kept stable through
v0.1.0 even though the family rename happened — runtime route
behavior, seed scripts, MCP tool names, views, tests, and SEO paths
all key off these.

This starter is intentionally fixed-manifest during bootstrap. The
first-run installer should ask for public copy and seed home/about/
contact/welcome content, not redesign the Schema/View/Procedure/
Trigger model. Custom workflow design belongs in `starters/blank` or
a later starter family.

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

The public site (rendered publication routes, contact form, MCP transport
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

## Production smoke recipe

End-to-end verification on a real Cloudflare account, ~20 min. Run this whenever the starter ships, an SDK release lands, or before declaring a v0.1.x release tag clean. Closes [#25](https://github.com/aotter/mantle/issues/25)'s production-smoke acceptance bullet.

Prerequisites:

- A Cloudflare account with billing profile (D1 + KV are free-tier; signup is the bar)
- A GitHub OAuth App configured with the Worker URL as both Homepage URL and `<worker_url>/admin/auth/github/callback` as Authorization Callback URL. The first deploy gives you `<worker_url>` so this is a two-pass setup; copy the Worker URL after step 4 below, register the OAuth App, then come back and set `wrangler secret put GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / ADMIN_GITHUB_LOGIN`.
- Node 20+, pnpm 9+, an empty target directory.

### Steps

1. **Bootstrap from prompt.** Paste [`docs/prompts/publication.en.md`](../../docs/prompts/publication.en.md) (or `publication.zh-TW.md`) into Claude Code / Cursor / Codex with placeholders filled in. The agent reads the install Skill, copies the starter, runs `setup:site`, and reports back a clean `pnpm validate` + `pnpm typecheck`.

2. **Local smoke.** Before any Cloudflare provisioning:

   ```bash
   pnpm fixture
   pnpm dev
   curl -s http://localhost:8787/en/posts/hello-world | head -5     # expect <!doctype html>
   curl -s http://localhost:8787/api/views/recent-posts | jq '.data.rows | length'
   curl -s http://localhost:8787/llms.txt | head -1
   pnpm test:integration                                             # mcp-smoke + view-smoke
   ```

   All four must succeed. If `test:integration` fails, fix locally before continuing.

3. **Provision Cloudflare resources** via the [provision Skill](../../skills/provision/SKILL.md). Creates D1, two KV namespaces (KV + OAUTH_KV), and writes their IDs into `wrangler.toml`. Verify `wrangler dev --remote` boots without binding errors.

4. **First deploy.**

   ```bash
   pnpm wrangler deploy
   # capture <worker_url> from the deploy output
   ```

5. **Register GitHub OAuth App** at <https://github.com/settings/developers> using `<worker_url>` and `<worker_url>/admin/auth/github/callback`. Then:

   ```bash
   pnpm wrangler secret put GITHUB_CLIENT_ID
   pnpm wrangler secret put GITHUB_CLIENT_SECRET
   pnpm wrangler secret put ADMIN_GITHUB_LOGIN     # your GH login
   pnpm wrangler secret put TURNSTILE_SECRET_KEY   # real Turnstile secret
   ```

6. **Initial seed against production** — write home/about/contact/welcome content directly:

   ```bash
   pnpm run seed:initial -- --seed-file initial-seed.json --origin "<worker_url>" --remote
   ```

   The agent should have produced `initial-seed.json` during install with localized public copy.

7. **Public smoke against deployed worker.**

   ```bash
   curl -s "<worker_url>/en/posts/welcome" | head -5
   curl -s "<worker_url>/en/posts/welcome.md" | head -5    # markdown mirror
   curl -s "<worker_url>/api/views/recent-posts" | jq '.data.rows[] | {slug, title}'
   curl -s "<worker_url>/llms.txt"
   curl -s "<worker_url>/en/llms.txt"
   curl -s "<worker_url>/sitemap.xml" | head -10
   ```

   All HTML routes return 200; the View REST endpoint returns the seeded posts; both llms.txt variants exist; sitemap lists every locale × every published entry.

8. **Owner sign-in.** Visit `<worker_url>/admin` in a browser, sign in with GitHub. `ensureBootstrapOwner` promotes you to `owner` on first login because `ADMIN_GITHUB_LOGIN` matches.

9. **MCP operator smoke.** Open Claude Code / Cursor / Codex in any working directory; configure the MCP client with `<worker_url>/mcp`. The first connection opens the consent screen — approve it with the same GitHub account.

   Then ask the agent to:

   ```text
   1. List entries in the posts collection.
   2. Create a draft post titled "Smoke test post" in en with slug "smoke-test"
      and a one-paragraph body.
   3. Publish it.
   4. Confirm the public HTML at <worker_url>/en/posts/smoke-test loads.
   5. Confirm the markdown mirror at <worker_url>/en/posts/smoke-test.md loads.
   6. Confirm the post appears in the recent-posts view.
   ```

   Every step must succeed. If `tools/list` doesn't show `create_draft_posts` / `request_publish` / etc., the boot validator failed silently — check `wrangler tail` for diagnostics.

10. **Cleanup.** Either keep the deployment as your real site or `wrangler delete` and clean up the OAuth App + KV / D1 resources. The smoke is reproducible from step 1.

### What this proves

- Pinned-Skill install path works end-to-end ([#22](https://github.com/aotter/mantle/issues/22))
- Provision + deploy creates real CF resources ([#23](https://github.com/aotter/mantle/issues/23))
- Standalone GitHub-only install + MCP smoke ([#24](https://github.com/aotter/mantle/issues/24))
- Blog/publication vertical end-to-end ([#25](https://github.com/aotter/mantle/issues/25))

### When this fails

- Step 2 fails: bug in the SDK or starter. File against the SDK; don't try to patch the consumer project.
- Step 6 (initial seed) fails: `initial-seed.json` is malformed; agent needs to re-run install's public-copy intake step.
- Step 9 (MCP) fails: most likely the OAuth consent flow — verify the OAuth App's callback URL matches `<worker_url>/admin/auth/github/callback` exactly, no trailing slash mismatch.

---
name: clam-cms provision
description: Deploy an installed clam-cms consumer project to the user's Cloudflare Worker and return the public URL plus Staff / User MCP URLs. Use after the install skill has produced a standalone project and the user wants the service online.
when_to_invoke: |
  Project exists, `pnpm validate` + `pnpm typecheck` pass, user wants to deploy.
applies_to: clam-cms@v0.1.0
---

# Provision a clam-cms project

You're taking an installed consumer project from local files to a user-owned Cloudflare Worker.

End state:

- D1 + render KV exist in the user's CF account; `wrangler.toml` points at them.
- Worker secrets are set (Better Auth + GitHub OAuth + Turnstile if the archetype carries it).
- Worker deploys; GitHub OAuth via Better Auth + MCP OAuth/DCR work.
- `mantle/site.md` frontmatter `site_url:` + `revisions:` updated; `AGENTS.md` `Public site:` line updated (ADR-0016).
- Post-deploy smoke proves unauthenticated MCP is rejected.
- Public URL + Staff MCP URL + User MCP URL printed; handoff points at `mantle/site.md` as the return-context surface.

Provision does **not** seed content. First real content is created after owner sign-in through Staff MCP / admin authoring.

## Principles (the gotchas that aren't obvious from CF docs)

1. **D1 + render KV always. No R2 in first-run.** R2 enables billing prompts on the CF account; first-run provision must not touch it. Treat first-party media as an explicit opt-in flow after the site is online — the publication starter uses external image URLs for seeded covers until the user asks for media hosting.

2. **Turnstile is conditional on the starter, not on this skill.** Archetypes that ship a public unauthenticated write surface (`presence`, `publication`, `intake` — all carry the `contact-messages` Schema and the CAPTCHA `before_create` Trigger) provision a Turnstile widget. Archetypes without one (`blank`) skip it. The starter's `provision.mjs` decides — don't override.

3. **Same GitHub account for everything.** `gh auth status`, the OAuth App registration, and `ADMIN_GITHUB_LOGIN` must all be the same login. Mismatched logins fail at the OAuth consent step with a 403 nobody can diagnose.

4. **Scoped CF API token, short-lived, revocable.** Token permissions: Workers Scripts Edit + Workers KV Storage Edit + D1 Edit + Turnstile Edit (for archetypes that need it). Account scope: the specific target account (never "All accounts"). TTL: 1 day. Client IP filter: use your IP if available. Created at `dash.cloudflare.com/profile/api-tokens` → "Edit Cloudflare Workers" template + permission additions. Revoke after provision finishes.

5. **OAuth App callback URL is exact.** `<worker_url>/admin/auth/github/callback`. Don't paraphrase, don't normalize, don't add trailing slash.

6. **One OAuth App per site.** It powers both browser sign-in and MCP OAuth/DCR consent. Don't create two.

## CLI surface

```bash
# Always:
pnpm validate
pnpm typecheck

# Provision (presence / publication / intake — uses the starter's provision.mjs):
pnpm provision:plan -- --project-name "<project-name>"
pnpm provision:up   -- --project-name "<project-name>" --github-username "<gh-login>" --client-id "<client-id>"

# blank: no provision.mjs ships. Use wrangler directly — see § blank below.
```

`provision:plan` is read-only. Reads `CLOUDFLARE_API_TOKEN` from env, looks up the workers.dev subdomain, prints (a) resources that will be created, (b) the precomputed worker URL, (c) the GitHub OAuth App fields the user needs to paste at `github.com/settings/developers`. No mutation.

`provision:up` reads both `CLOUDFLARE_API_TOKEN` and `GITHUB_CLIENT_SECRET` from env. It does everything in one pass: creates D1 + render KV + (conditional) Turnstile via CF API, writes resource IDs + `PUBLIC_ORIGIN` + Turnstile site key into `wrangler.toml`, deploys, pipes worker secrets (`ADMIN_GITHUB_LOGIN`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET` (freshly generated), `TURNSTILE_SECRET_KEY`), updates `mantle/site.md` + `AGENTS.md` per ADR-0016. Single deploy — origin is correct before deploy. Partial failures don't roll back; IDs are printed so the user can clean up via dashboard or rerun.

Do not run `wrangler d1 create` / `wrangler kv namespace create` / `wrangler secret put` by hand when the script can do it. Wrangler's KV namespace command can produce ugly duplicated names like `<project>-<project>-render`; the script bypasses this by using the CF API with exact titles.

## Flow

1. **Preflight** — `pnpm validate` + `pnpm typecheck` + `gh auth status` (confirm gh-login matches `ADMIN_GITHUB_LOGIN`).

2. **Get CF API token from user.** The token comes via stdin (`! read -rsp …`), env var, or chat paste — whichever the user prefers. Don't lecture about credential safety more than once; the scoped token + 1-day TTL + revocation reminder is the safety story. Set `CLOUDFLARE_API_TOKEN` in env and confirm `pnpm exec wrangler whoami` returns the expected account.

3. **`pnpm provision:plan -- --project-name X`.** Print the precomputed values to the user. Ask the user to register the GitHub OAuth App with those exact values (Homepage URL, Authorization callback URL). The user generates a Client Secret and copies both Client ID and Secret back to you.

4. **`pnpm provision:up`.** With `CLOUDFLARE_API_TOKEN` and `GITHUB_CLIENT_SECRET` in env, run with `--project-name`, `--github-username`, `--client-id`. The script does the rest. Surface the printed URLs verbatim.

5. **Post-deploy smoke.**

   ```bash
   BASE='<worker_url>'
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/mcp"                       # 401 — unauth MCP rejected
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"                          # 302 → canonical locale
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/<canonical-locale>"        # 200 (404 expected pre-content; that's also fine)
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/sitemap.xml"               # 200
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/views/recent-posts"    # 200 — publication only
   ```

   Don't submit real contact/lead form posts as smoke; that creates test records in production storage.

6. **Bootstrap owner + MCP consent.** Tell the user to open `<worker_url>/admin/sign-in` and complete GitHub OAuth. The callback creates the user and calls `ensureBootstrapOwner` using `ADMIN_GITHUB_LOGIN`. Then connect an MCP-capable client to `<worker_url>/staff/mcp` — DCR handles registration, browser opens the consent screen, staff membership is checked, tokens issue, `/staff/mcp` accepts the bearer.

   `<worker_url>/mcp` is the end-user MCP resource — read-only View queries in v0.1. Authoring lives on `/staff/mcp`.

7. **Second-agent proof.** Connect a second agent through Staff MCP and run the starter's core workflow (list collections, create draft, update, publish, confirm public route). For publication: posts CRUD + `recent-posts` View. For intake: leads CRUD + `leads-recent` View. This is the v0.1.0 release gate — don't call the install production-ready until it works.

8. **Handoff** — see § Mantle handoff below.

## `blank` archetype

The `blank` starter ships without a `provision.mjs` orchestrator. Its production proof requires manually wiring the same Better Auth factory, OAuth App, `ADMIN_GITHUB_LOGIN`, and dual MCP mounts as `publication` before you can claim MCP operation works. v0.1.0 ships this as a known gap; advanced users wire it themselves with raw `wrangler` commands. If your end-user picked `blank`, surface this honestly: `pnpm dev` works out of the box for local exploration, but production deploy requires per-step wrangler invocations until blank's provision.mjs lands.

## Secret etiquette

Both the CF API token and the GitHub Client Secret can come in via stdin (`read -rsp` → `export`) or chat paste. Show both paths in one short message, in the user's language, at native register. Once they pick, do not re-litigate. If you choose to render the prompt, intent only — these are illustrative, write at the user's natural register:

- Terminal (preferred — value stays out of chat log):
  ```
  ! read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN && printf "\n"
  ```
  "Say `ok` when done."

- Chat paste: "The IP filter + 1-day TTL + revocation reminder make this paste low-risk for one-time use."

Do not put `--client-secret <value>` in the visible command by default. `provision:up` reads `GITHUB_CLIENT_SECRET` from env — prefer:

```bash
read -rs GITHUB_CLIENT_SECRET
export GITHUB_CLIENT_SECRET
pnpm provision:up -- --project-name X --github-username Y --client-id Z
```

If an agent safety classifier refuses to run a secret-bearing command, ask the user once for explicit authorization to run it via stdin/env (the secret never lands in a file, RUN_NOTES, or command line). If they decline, hand them the literal `read -rs … && export …` line to run themselves.

After provision: `unset CLOUDFLARE_API_TOKEN`, then remind the user to revoke at `dash.cloudflare.com/profile/api-tokens`.

## Mantle handoff

After all checks pass, drop into [Mantle's voice (see install SKILL § Mantle letter — voice rules)](../install/SKILL.md#mantle-letter--voice-rules) for the final message only. `provision:up` already updated `mantle/site.md` `site_url:` + appended a `revisions:` entry stamped `by: provision`, and updated `AGENTS.md` `Public site:` (ADR-0016). Confirm both wrote (`git status -- mantle/site.md AGENTS.md`).

Render the handoff in the user's language. Intent:

- Site is online at `<worker_url>`. Two short reasons to look first: read as a visitor, then sign in at `<worker_url>/admin/sign-in`.
- `mantle/site.md` now has the URL written in. Pasting that file's contents into a future conversation summons Mantle back. (A URL form via `.well-known/mantle/` is deferred.)
- Staff MCP URL is in the admin sidebar; raw link `<worker_url>/staff/mcp`.
- Acknowledge if the admin 5-card render is deferred (#50) — letter lives in `mantle/site.md` `## welcome`.
- If a Cloudflare API token was used, remind to revoke at `dash.cloudflare.com/profile/api-tokens`.

After the handoff, drop Mantle's voice. The user can ask follow-ups in normal register.

## Diagnostics

| Symptom | Cause | Fix |
|---|---|---|
| `provision:plan` "expected 1 account" | Token sees multiple accounts | Recreate token with **Account Resources** scoped to the single target account, not "All accounts" |
| `provision:plan` "workers.dev subdomain not set" | User never claimed a subdomain | `dash.cloudflare.com` → Workers & Pages → claim a subdomain → rerun |
| `provision:up` fails on CF API call | Token missing a scope | Recreate with Workers Scripts Edit + Workers KV Storage Edit + D1 Edit + Turnstile Edit (the last only for archetypes that need it) |
| `provision:up` fails after some resources created | Partial provision | IDs printed before failure — delete via dashboard and rerun, or update `wrangler.toml` manually with printed IDs and rerun the failing step. Don't silently retry |
| Worker boots but `/staff/mcp` returns 500 | OAuth secrets failed to set | `printf '%s' '<v>' \| pnpm exec wrangler secret put GITHUB_CLIENT_ID` (etc.); redeploy |
| Owner signs in but MCP consent returns 403 | `ADMIN_GITHUB_LOGIN` doesn't match the GitHub login that signed in | `wrangler secret put ADMIN_GITHUB_LOGIN`; sign in again |
| GitHub OAuth callback shows mismatch error | OAuth App callback URL registered wrong | Edit OAuth App callback to exactly `<worker_url>/admin/auth/github/callback` |
| Public publication has no posts after provision | Expected — provision doesn't seed | Sign in at `<worker_url>/admin/sign-in` and use Staff MCP / admin authoring. Don't run `fixture` or `seed:initial` against prod |

## Don't

- Don't reintroduce stub bearer auth or `CLAM_ALLOW_STUB_OAUTH`.
- Don't put secrets in `wrangler.toml`, `.env` (committed), or README snippets with real values.
- Don't block v0.1.0 on admin UI. Bootstrap owner + MCP is the v0.1.0 proof.
- Don't expose staff management as MCP tools.
- Don't promise custom domain automation in v0.1.0.
- Don't enable R2 / ask for billing setup / mention credit cards in the first-run path. Media hosting is an explicit opt-in add-on.
- Don't ship the Turnstile test site key (`1x00000000000000000000AA`) or `dev-stub` secret to production. The starter ships them for `pnpm dev`; production deploys must replace both. If the user explicitly chose no contact form during install, you wouldn't have a Turnstile widget at all — say so.
- Don't deploy twice. `provision:up` deploys once after origin is correct.

## See also

- [`install`](../install/SKILL.md) — the upstream skill; § Ground truth there has the 4-atom + scaffold-file orientation
- [ADR-0014](../../docs/adr/0014-auth-better-auth-and-multi-tenant-mcp.md) — Better Auth + multi-tenant MCP architecture
- [ADR-0016](../../docs/adr/0016-site-semantic-layer.md) — `mantle/site.md` semantic layer that `provision:up` updates

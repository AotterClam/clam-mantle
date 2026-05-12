---
name: mantle provision
description: Deploy an installed mantle consumer project to the user's Cloudflare account and return the public URL plus Staff/User MCP URLs. Use after the install Skill has created a standalone project and the user wants the service online.
when_to_invoke: |
  Project exists, `pnpm validate` and `pnpm typecheck` pass, and the user wants to deploy or complete the website-generated install flow.
applies_to: mantle@v0.1.0
---

# Provision a mantle project for production

You are taking an installed consumer project from local files to a user-owned Cloudflare Worker. The v0.1.0 proof does not require an admin UI. It requires owner bootstrap, GitHub OAuth/DCR, staff-gated MCP, deploy, and a second-agent handoff. Initial content is **not** seeded by provision — that happens after sign-in through Staff MCP / admin authoring.

End state for this Skill:

- D1 and render KV exist in the user's Cloudflare account.
- `wrangler.toml` points at those resource IDs.
- Worker secrets are set.
- The Worker deploys with Better Auth-backed GitHub OAuth + MCP OAuth/DCR.
- `mantle/site.md` frontmatter `site_url:` + `revisions:` updated; `AGENTS.md` `Public site:` updated (per ADR-0016).
- Public URL, Staff MCP URL, and User MCP URL are printed; handoff text points the user at `mantle/site.md` as the return-context surface.
- Post-deploy smoke proves unauthenticated MCP is rejected.

## Required Inputs

The values land in the project via `create-mantle` and the install skill. Confirm only what affects resource names or the OAuth identity:

```yaml
project_name: "<worker-safe-name>"   # used as the worker name
archetype:    "presence"             # presence | publication | intake | blank
github_username: "<gh login>"        # becomes ADMIN_GITHUB_LOGIN
```

If `github_username` was set by Mantle during install, still confirm local `gh auth status` — the Worker secret must match the GitHub login that signs in through OAuth.

For v0.1.0, the `publication`, `presence`, and `intake` archetypes share the publication starter and the provision flow below. The `blank` archetype must have the same Better Auth factory, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_GITHUB_LOGIN`, and dual MCP mounts as publication before its production proof can claim MCP operation.

## POC-Proven Flow Invariants

The previous `mantle-poc` blog Skill (now `publication`) successfully validated this flow. Preserve these details:

- Talk in user-facing terms: "creating storage for posts" is better than "creating a D1 binding".
- Use browser auth first for GitHub. For Cloudflare, non-technical users may be better served by a scoped API token copied from the dashboard than an interactive terminal login.
- Keep the same GitHub account for website intake, CLI auth, GitHub OAuth App, and bootstrap owner.
- Create two Cloudflare storage resources for production: D1 and render KV.
- Set `ADMIN_GITHUB_LOGIN` before the first OAuth callback.
- Create one GitHub OAuth App. It powers browser sign-in and MCP OAuth/DCR consent.
- Use the exact callback path `<worker_url>/admin/auth/github/callback`.
- End by printing public URL, Staff MCP URL, User MCP URL, and token-revocation reminder if a Cloudflare API token was used.

## Preflight

Run from the consumer project root:

```bash
pnpm validate
pnpm typecheck
gh auth status
```

For non-technical users, prefer a Cloudflare API token created in the dashboard and revoked after provisioning. Do not start by asking them to run `wrangler login`.

Default first-run provisioning must not enable R2, ask for billing setup,
or mention credit cards. First-party media hosting is an optional add-on
flow after the site is online; publication starters use external image
URLs for seeded covers until the user explicitly asks to enable media
hosting.

Guide the user step by step:

1. Open `https://dash.cloudflare.com/profile/api-tokens` and click **Create Token**.
2. Find the **Edit Cloudflare Workers** template and click **Use template**. This pre-fills Workers Scripts Edit + Workers KV Storage Edit.
3. Scroll to **Account Resources** — change the dropdown from "All accounts" to your specific account name. This prevents the token from touching any other account you may have.
4. Scroll to **Permissions** and click **+ Add more**. Add both:
   - Account → **D1** → **Edit**
   - Account → **Turnstile** → **Edit** (lets us create the bot-check widget without browser juggling)
5. Set **TTL / Token Expiration** to **1 day**. Short-lived tokens expire on their own even if you forget to revoke.
6. **Optional but recommended — IP filtering**: under **Client IP Address Filtering**, click **Add** then click **Use My IP**. With an IP filter, the token is useless even if it leaks out of the chat window.
7. Click **Continue to summary**, review the listed permissions and account scope, then click **Create Token**.
8. Copy the token — it is shown **only once**.

### How the user sends you the token

Follow [Mantle persona](../install/SKILL.md). Quiet, technical, no cheerleading. Show both paths in one short message. Use the user's language; don't translate.

Render in the user's language at native register. The intent of the message is:

- Two ways to send the token: terminal (stdin, doesn't enter chat log) and chat-paste.
- Terminal: the exact `! read -rsp ... && export ...` line, and "say `ok` when done."
- Chat-paste: a single line on why it's safe this once — IP filter + 1-day TTL + revocation reminder — without re-litigating it.

zh-TW illustrative:
> Token 給我兩種方式。
>
> Terminal（推薦，token 不會進對話紀錄）：
>
> ```
> ! read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN && printf "\n"
> ```
>
> 跑完跟我說「ok」。
>
> 或直接貼。剛剛設了 IP 限制和 1 天 TTL，這次貼進對話是安全的，做完我會提醒你撤銷。

EN illustrative:
> Token comes to me two ways.
>
> Terminal (preferred, token stays out of chat):
>
> ```
> ! read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN && printf "\n"
> ```
>
> Say `ok` when it's done.
>
> Or paste it. The IP filter + 1-day TTL make this paste safe — I'll remind you to revoke when we finish.

If the user picks paste, accept it without lecturing further, set the env var in a single command without echoing:

```bash
read -rs CLOUDFLARE_API_TOKEN
export CLOUDFLARE_API_TOKEN
pnpm exec wrangler whoami
```

After provisioning, run:

```bash
unset CLOUDFLARE_API_TOKEN
```

Then remind the user to revoke the token in `https://dash.cloudflare.com/profile/api-tokens`.

**GitHub OAuth App credentials** (Client ID + Client Secret): same dual-path framing. The redirect-URL constraint means the secret is useless to an attacker without access to your registered callback domain — chat paste is low risk. Tell the user this once, do not lecture again.

Do not put `--client-secret <value>` in the visible command by default. `provision:up` accepts the secret from `GITHUB_CLIENT_SECRET`, so prefer:

```bash
read -rs GITHUB_CLIENT_SECRET
export GITHUB_CLIENT_SECRET
pnpm run provision:up -- \
  --project-name "<project_name>" \
  --github-username "<github_username>" \
  --client-id "<client-id>"
```

If an agent safety classifier refuses to run the command because it involves credentials, do not hand the user a long secret-bearing command. Render this in the user's language (intent: explain that you'd run the secret via stdin/env without writing it to file / RUN_NOTES / command line, and ask for explicit authorization to proceed).

zh-TW illustrative:
> 這步要設 GitHub Client Secret。如果你授權我在 terminal 代跑，我會用 stdin/env 不回顯的方式執行；secret 不會進檔案、RUN_NOTES、或命令列。要授權嗎？

EN illustrative:
> This step sets the GitHub Client Secret. With your explicit OK, I can run it via stdin/env without echoing — the secret never lands in any file, RUN_NOTES, or command line. Authorize?

After that explicit authorization, run the env-var form above. Only use `--client-secret` inline for non-interactive CI-style automation where the caller already controls logging and history.

If the user explicitly says they are comfortable with terminal browser auth, `pnpm exec wrangler login` is acceptable instead.

## Step-by-step

The starter-owned `provision.mjs` orchestrator collapses resource creation, wrangler.toml updates, secret setting, deploy, and seeding into two scripted phases. Do not run individual `wrangler d1 create` / `kv namespace create` / `secret put` commands by hand — let the script handle stdout parsing, ID wiring, and ordering.

Do not create KV namespaces with `wrangler kv namespace create` in this flow. Wrangler can prefix namespace titles with the Worker name, which can produce ugly duplicated names like `<project>-<project>-render`. The starter script creates KV via the Cloudflare API with exact titles:

- Render KV: `<project_name>-render`

### 1. Plan — discover account, print the OAuth App instructions

```bash
pnpm run provision:plan -- --project-name "<project_name>"
```

The script reads `CLOUDFLARE_API_TOKEN` from env, looks up the workers.dev subdomain via the CF API, and prints:

- Resources that will be created (D1 + render KV + Turnstile widget).
- The exact Workers URL (no first deploy needed to discover it).
- GitHub OAuth App fields, with the precomputed callback URL.

It does not create anything.

### 2. User creates the GitHub OAuth App

The user opens `https://github.com/settings/developers` → New OAuth App and pastes the values printed by `provision:plan`. After registering, they generate a Client Secret and copy both Client ID and Client Secret. **Do not ask them to type any wrangler commands.**

### 3. Up — one command does everything else

```bash
read -rsp "GitHub Client Secret: " GITHUB_CLIENT_SECRET && export GITHUB_CLIENT_SECRET && printf "\n"
pnpm run provision:up -- \
  --project-name "<project_name>" \
  --github-username "<github_username>" \
  --client-id "<client-id>"
```

This single command:

1. Creates D1 and render KV via CF API.
2. Creates the Turnstile widget via CF API.
3. Writes resource IDs, `PUBLIC_ORIGIN`, and the Turnstile site key into `wrangler.toml`; updates `src/mantleConfig.ts` `origin`.
4. `pnpm run deploy` (single deploy — origin is already correct).
5. Pipes worker secrets via `wrangler secret put`:
   - `ADMIN_GITHUB_LOGIN` (bootstrap owner)
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `BETTER_AUTH_SECRET` (generated fresh by the script)
   - `TURNSTILE_SECRET_KEY`
6. Updates the site semantic layer per [ADR-0016](../../docs/adr/0016-site-semantic-layer.md):
   - `mantle/site.md` frontmatter `site_url:` → real Workers URL
   - Append `revisions:` entry `{ at: <iso>, by: provision, summary: "deployed to <url>" }`
   - `AGENTS.md` `Public site:` line → real Workers URL
   - No-op if those files don't exist (legacy installs predating Mantle).
7. Prints the public URL, Staff MCP URL, User MCP URL, sign-in URL, and a token-revocation reminder. The final stdout block points the user at `mantle/site.md` as the return-context handoff surface.

Provision does **not** seed initial content. First real content is created after owner sign-in through Staff MCP / admin authoring.

Do not run individual `wrangler` commands when this script can do it. Do not deploy twice — `provision:up` deploys once after origin is already correct.

If any step fails, the script exits non-zero. Resources already created are not rolled back; their IDs are printed so the user can clean up via dashboard or rerun after fixing the issue. Do not silently retry.

### 4. Bootstrap owner session and MCP consent

Tell the user to open:

```text
<worker_url>/admin/sign-in
```

After GitHub redirects back, the callback creates or updates the user and calls `ensureBootstrapOwner` using `ADMIN_GITHUB_LOGIN`.

Then connect an MCP-capable client to:

```text
<worker_url>/staff/mcp
```

Expected flow:

1. MCP client discovers/registers through the OAuth/DCR endpoints.
2. Browser opens the consent screen.
3. If not signed in, user is redirected through GitHub sign-in.
4. Staff membership is checked.
5. Approved client receives tokens.
6. `/staff/mcp` accepts that bearer token and dispatches staff authoring tools.

`<worker_url>/mcp` is the end-user MCP resource. In v0.1 it exposes only read-only View query tools; content authoring and lifecycle operations belong on `/staff/mcp`.

### 5. Post-deploy smoke

Run unauthenticated checks:

```bash
BASE='<worker_url>'
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/mcp"
```

Expected: `401`.

For `publication`, also check:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/<canonical-locale>"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/<canonical-locale>/posts"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/<canonical-locale>/posts/welcome"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/sitemap.xml"
curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/views/recent-posts"
```

Expected:

- `/` is usually `302`.
- `/<canonical-locale>` is `200`.
- `/<canonical-locale>/posts` is `200`.
- `/<canonical-locale>/posts/welcome` is `200` if the seed slug is `welcome`; use the actual seed slug otherwise.
- `/sitemap.xml` is `200`.
- `/api/views/recent-posts` is `200`.

Do not submit real contact/order forms as smoke unless the user asked for test records.

A freshly-provisioned publication site has no posts yet — that is expected. First content is created after the next step (owner sign-in + Staff MCP / admin authoring), not by provision.

### 6. Second-agent operating proof

After MCP OAuth succeeds, ask the second agent to run the starter's core workflow.

For `publication`:

- List MCP tools.
- List existing welcome/home/about content.
- Create a second post draft.
- Update title/body/slug/locale.
- Publish it.
- Confirm public HTML route.
- Confirm `.md` mirror.
- Confirm `recent-posts` View includes the post.

For `blank`:

- List MCP tools.
- Create a draft in the starter's example Schema.
- Update it.
- List it through MCP.
- Confirm the relevant View/API behavior.

Only run the `blank` production proof after its `src/mantleConfig.ts` uses the same Better Auth factory, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_GITHUB_LOGIN`, and dual MCP mounts as the publication starter repo.

This second-agent proof is the release gate. Do not call the install production-ready until this works.

## Final Handoff

Follow [Mantle persona](../install/SKILL.md). Quiet, no performance.

The `provision:up` script already updates the site semantic layer per [ADR-0016](../../docs/adr/0016-site-semantic-layer.md): it rewrites `mantle/site.md` frontmatter `site_url:` from the install placeholder to the real Workers URL, and appends a `revisions:` entry stamped `by: provision`. The same update lands in `AGENTS.md` `Public site:`. Confirm both wrote (`git status -- mantle/site.md AGENTS.md`) before the handoff message.

Render the handoff in the user's language. Intent:

- The site is online at `<worker_url>`. Two short reasons to look first: read it as a visitor, then sign in at `<worker_url>/admin/sign-in`.
- I wrote the URL into `mantle/site.md`. Next time you want me back, paste those contents into a conversation — I read it whole on return. (`.well-known/mantle/` route is deferred.)
- The admin sidebar exposes the Staff MCP URL; only print the raw URL after pointing at the admin path.
- Acknowledge the admin 5-card render is deferred (#50) — the welcome letter currently lives in `mantle/site.md` `## welcome`.
- If a Cloudflare API token was used, remind to revoke.

zh-TW illustrative:
> 站起來了：`<worker_url>`。
>
> 先以訪客身份打開看一下，再到 `<worker_url>/admin/sign-in` 用 GitHub 登入。
>
> 我把這個網址寫進了 `mantle/site.md`。下次想找我，把那檔內容貼進對話就好。（之後會做 `.well-known/mantle/` 的網址版，目前先用貼的。）
>
> Staff MCP 的網址在 admin 側欄會看到；原始連結是 `<worker_url>/staff/mcp`。
>
> （首頁 5 張卡片的 admin 渲染還沒做，內容已經寫在 `mantle/site.md` 的 `## welcome` 裡了。）
>
> Cloudflare token 記得到 `https://dash.cloudflare.com/profile/api-tokens` 撤銷。

EN illustrative:
> Site is up: `<worker_url>`.
>
> Look at it as a visitor first, then sign in at `<worker_url>/admin/sign-in` with GitHub.
>
> I wrote the URL into `mantle/site.md`. Next time you want me back, paste those contents into a conversation — I read it whole on return. (A URL form via `.well-known/mantle/` is deferred; for now the paste does it.)
>
> The Staff MCP URL is in the admin sidebar; raw link is `<worker_url>/staff/mcp`.
>
> (The admin 5-card render isn't shipped yet; the welcome letter lives in `mantle/site.md` `## welcome`.)
>
> Revoke the Cloudflare token at `https://dash.cloudflare.com/profile/api-tokens` when you're done.

## Diagnostic Recipes

| Symptom | Cause | Fix |
|---|---|---|
| `provision:plan` says "expected 1 account" | Token sees multiple Cloudflare accounts | Re-create the token with **Account Resources** scoped to the single target account, not "All accounts". |
| `provision:plan` says "workers.dev subdomain not set" | User has never claimed a workers.dev subdomain | Open `https://dash.cloudflare.com` → Workers & Pages and claim a subdomain, then re-run plan. |
| `provision:up` fails on CF API call | Token missing a scope | Token must include Workers Scripts Edit, Workers KV Edit, D1 Edit, Turnstile Edit. Recreate with all four. |
| `provision:up` fails after some resources created | Partial provision; IDs printed before failure | Either delete the listed resources via dashboard and rerun, or update `wrangler.toml` manually with the printed IDs and rerun the failing step. Do not silently retry. |
| Worker boots but `/staff/mcp` returns 500 | OAuth secrets failed to set | Re-pipe the secrets manually: `printf '%s' '<v>' \| pnpm exec wrangler secret put GITHUB_CLIENT_ID` (etc.); redeploy. |
| Owner signs in but MCP consent returns 403 | `ADMIN_GITHUB_LOGIN` does not match GitHub login | Update with `wrangler secret put ADMIN_GITHUB_LOGIN`; sign in again. |
| GitHub OAuth callback shows mismatch/error | OAuth App callback URL was registered wrong | Edit the OAuth App callback to exactly `<worker_url>/admin/auth/github/callback`. |
| Public publication has no posts after provision | Expected — provision doesn't seed | Sign in at `<worker_url>/admin/sign-in` and use Staff MCP / admin authoring to create the first post. Do not run `fixture` or `seed:initial` against prod. |

## Don't

- Don't reintroduce stub bearer auth or `MANTLE_ALLOW_STUB_OAUTH`.
- Don't put secrets in `wrangler.toml`, `.env`, README snippets with real values, or chat.
- Don't block v0.1.0 on admin UI. Bootstrap owner + MCP is enough for first proof.
- Don't expose staff management as MCP tools.
- Don't promise custom domain automation in v0.1.0.
- Don't use paid Cloudflare features for the default path.
- Don't create R2 buckets or ask for billing/credit-card setup in the first-run provision path. If the user asks for first-party media hosting, treat it as an explicit opt-in add-on flow.
- **Don't ship the Turnstile test site key (`1x00000000000000000000AA`) or `dev-stub` secret to production.** The starter ships them so `pnpm dev` works; production deploys must replace both. If you skip the contact form entirely, say so explicitly to the user.

## When You're Done

Follow [Mantle persona](../install/SKILL.md). Quiet, plain.

Report in the user's language. Intent:

- Public URL, Staff MCP URL, User MCP URL, sign-in URL.
- Bootstrap owner GitHub username (so the user can sanity-check it before signing in).
- Post-deploy smoke results.
- Whether second-agent MCP operation passed; if not, name it as the next required step.
- That `mantle/site.md` was updated; the user can paste it into a future conversation to summon Mantle back.
- Invite the user to ask for content, copy, or design changes in plain language — content goes through Staff MCP / admin authoring (the Editor); design through `customize-design`; site logic through Mantle.

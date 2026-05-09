---
name: mantle provision
description: Deploy an installed mantle consumer project to the user's Cloudflare account and return the public URL plus Staff/User MCP URLs. Use after the install Skill has created a standalone project and the user wants the service online.
when_to_invoke: |
  Project exists, `pnpm validate` and `pnpm typecheck` pass, and the user wants to deploy or complete the website-generated install flow.
applies_to: mantle@v0.1.0
---

# Provision a mantle project for production

You are taking an installed consumer project from local files to a user-owned Cloudflare Worker. The v0.1.0 proof does not require an admin UI. It requires owner bootstrap, GitHub OAuth/DCR, staff-gated MCP, deploy, initial public content, and a second-agent handoff.

End state for this Skill:

- D1 and render KV exist in the user's Cloudflare account.
- `wrangler.toml` points at those resource IDs.
- Worker secrets are set.
- The Worker deploys with Better Auth-backed GitHub OAuth + MCP OAuth/DCR.
- For `starter: publication`, initial home/about/contact/welcome content is seeded directly to D1/KV.
- Public URL, Staff MCP URL, and User MCP URL are printed.
- Post-deploy smoke proves unauthenticated MCP is rejected.
- The user has instructions for connecting a second AI agent to MCP.

## Required Inputs

Use values from the website-generated starting prompt or the install Skill handoff:

```yaml
project_name: "<worker-safe-name>"
starter: "publication" # publication | blank
github_username: "<verified-by-website>"
locales: ["en", "zh-TW"]
origin: "https://example.com" # may be replaced after deploy
seed_file: "initial-seed.json"
```

If `github_username` was verified by the website, still confirm local `gh auth status`; the Worker secret must match the GitHub login that signs in through OAuth.

For the first v0.1.0 production proof, `starter: publication` is the supported path. It assumes the copied publication manifests stay fixed during bootstrap; provision only deploys infra, applies initial public content, bootstraps the owner, and proves MCP operation.

`starters/blank` is the right surface for bootstrap-time workflow design. If the user wants to define their own Schemas, Views, Procedures, or Triggers before first deploy, switch to the blank/custom-app path instead of mutating `publication`. Blank must have the same real OAuth/DCR wiring as `publication` before claiming production MCP operation.

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

Present **both** paths at once. Do not show only the terminal path — many users will not understand it and will get stuck. Frame it like this:

> 拿到 token 後，有兩種方式給我：
>
> **方式 A（推薦）**：在 terminal 輸入這行，token 不會進對話紀錄。
>
> ```
> ! read -rsp "Cloudflare API token: " CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN && printf "\n"
> ```
>
> 完成後跟我說「ok」就好。
>
> **方式 B（看不懂方式 A 就用這個）**：直接貼進對話框。
>
> 一般情況下憑證不該貼對話，因為對話紀錄會留下副本。但你剛剛建的 token 已經設了 IP 限制和 1 天 TTL，外洩出去也沒人能用，做完我會提醒你撤銷。所以這次貼進對話是安全的，不用糾結。

If the user picks B and pastes, accept it without lecturing further, set the env var in a single command without echoing:

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
  --client-id "<client-id>" \
  --seed-file initial-seed.json
```

If an agent safety classifier refuses to run the command because it involves credentials, do not hand the user a long secret-bearing command. Say:

> 這一步會設定 GitHub Client Secret。若你明確授權我在 terminal 代跑，我可以用不回顯的 stdin/env 方式執行；secret 不會寫進檔案、RUN_NOTES 或命令列。請回覆「我授權你代跑 provision:up」。

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

It does not create anything. Make sure `initial-seed.json` already exists at the consumer root (built during install per the Public Copy Intake).

### 2. User creates the GitHub OAuth App

The user opens `https://github.com/settings/developers` → New OAuth App and pastes the values printed by `provision:plan`. After registering, they generate a Client Secret and copy both Client ID and Client Secret. **Do not ask them to type any wrangler commands.**

### 3. Up — one command does everything else

```bash
read -rsp "GitHub Client Secret: " GITHUB_CLIENT_SECRET && export GITHUB_CLIENT_SECRET && printf "\n"
pnpm run provision:up -- \
  --project-name "<project_name>" \
  --github-username "<github_username>" \
  --client-id "<client-id>" \
  --seed-file initial-seed.json
```

This single command:

1. Creates D1 and render KV via CF API.
2. Creates the Turnstile widget via CF API.
3. Writes resource IDs, `PUBLIC_ORIGIN`, and the Turnstile site key into `wrangler.toml`.
4. Reads `initial-seed.json` public copy and reruns `setup:site` so `src/mantleConfig.ts` `siteDefaults` matches the seeded brand, description, locales, and real Workers URL.
5. Rewrites `initial-seed.json.origin` to the real Workers URL so the consumer repo snapshot is not left with `https://example.com`.
6. `pnpm run deploy` (single deploy — origin is already correct).
7. Pipes worker secrets via `wrangler secret put`:
   - `ADMIN_GITHUB_LOGIN` (bootstrap owner)
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
   - `BETTER_AUTH_SECRET` (generated fresh by the script)
   - `TURNSTILE_SECRET_KEY`
8. Runs `seed:initial --remote` against the deployed worker URL.
9. Prints the public URL, Staff MCP URL, User MCP URL, sign-in URL, and a token-revocation reminder.

Do not run individual `wrangler` or seed commands when this script can do it. Do not deploy twice — `provision:up` deploys once after origin is already correct.

If any step fails, the script exits non-zero. Resources already created are not rolled back; their IDs are printed so the user can clean up via dashboard or rerun after fixing the issue. Do not silently retry.

### 4. Bootstrap owner session and MCP consent

Tell the user to open:

```text
<worker_url>/admin/auth/github
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

Do not treat an empty publication as product success. If public pages are empty, fix `initial-seed.json` and re-run `seed:initial --remote` before handoff.

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

Only run the `blank` production proof after its `src/mantleConfig.ts` uses the same Better Auth factory, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_GITHUB_LOGIN`, and dual MCP mounts as `starters/publication`.

This second-agent proof is the release gate. Do not call the install production-ready until this works.

## Friendly Final Handoff

Do not end with only infra URLs. Use product language:

```text
Your site is online:
<worker_url>

Open it first. If the title, footer sentence, colors, tone, or first content feels wrong, tell me what to change and I can keep adjusting it.

Next, sign in as the site owner:
<worker_url>/admin/auth/github

After sign-in, the admin console will show the Staff MCP URL and the next prompts for letting another AI agent manage content.
```

Only print the raw Staff MCP URL after explaining that the admin console also shows it.

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
| Public publication has no posts | Initial seed step failed during provision | Run `pnpm run seed:initial -- --seed-file initial-seed.json --origin "<worker_url>" --remote` directly. Do not run fixture against prod. |

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

Print:

- Public URL: `<worker_url>`.
- Staff MCP URL: `<worker_url>/staff/mcp`.
- User MCP URL: `<worker_url>/mcp`.
- Bootstrap owner GitHub username.
- Post-deploy smoke results.
- Whether second-agent MCP operation passed.

If second-agent MCP operation has not run yet, say exactly that and make it the next required step. Also invite the user to ask for content, copy, and design changes in plain language.

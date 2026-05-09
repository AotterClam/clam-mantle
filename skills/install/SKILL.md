---
name: mantle install
description: Bootstrap a new mantle consumer project from a website-generated starting prompt. Use when the user pasted a mantle prompt that names a starter, GitHub username, locales, and a pinned mantle Skill URL, or when the user starts from an empty repo and asks for a publication site / headless CMS / MCP-native Cloudflare site.
when_to_invoke: |
  The user is starting from scratch. Strong indicators: empty repo, pasted "Mantle CMS install request", no manifests/ directory, no @aotter/* deps in package.json.
applies_to: mantle@v0.1.0
---

# Install a mantle project

You are the agent installing a user-owned mantle project. The fastest v0.1.0 path is website-assisted: the official site collects the user's GitHub username, starter choice, and locales, then gives the user a localized starting prompt plus a pinned Skill URL. Treat that prompt as the source of truth unless it is internally inconsistent.

End state for this Skill:

- A standalone consumer project exists in the current directory.
- Dependencies resolve without this repo being the workspace root.
- `pnpm validate` and `pnpm typecheck` pass.
- Local preview can boot.
- The project is ready for the `provision` Skill to create Cloudflare resources and deploy.

## Website Handoff Contract

Localized prompt drafts the official site uses (and direct users can paste into any agent) live under [`docs/prompts/`](../../docs/prompts/) — currently `publication.en.md` and `publication.zh-TW.md`. Each prompt embeds the structured `mantle_request:` block below, with `{name}` placeholders the official site interpolates from the user's session before rendering.

The prompt should include these fields. Parse them before asking the user anything:

```yaml
mantle_request:
  mantle_version: "0.0.6-alpha"
  template_ref: "main"
  skill_url: "https://raw.githubusercontent.com/aotter/mantle/<ref>/skills/install/SKILL.md"
  starter: "publication" # publication | blank (others are roadmap; see Starter Families)
  github_username: "<verified-by-website>"
  locales: ["en", "zh-TW"]
  project_name: "<worker-safe-name>"
  brand: "<public brand name>"
  description: "<one-line site description>"
  origin: "https://example.com" # optional placeholder is OK before deploy
```

If `starter`, `github_username`, and `locales` are present, do not re-run a long intake interview. Confirm only the values that affect resource names or public copy:

```text
I will create <project_name> using starters/<starter>, bootstrap GitHub user <github_username> as owner, and set locales to <locales>. I will not create Cloudflare resources until the provision step.
```

If a field is missing, ask the minimum question needed. Do not ask the user to choose a starter if the prompt already chose one.

## Public Copy Intake

The user is not a copywriter. Your job here is to act as a PM: extract enough signal to draft confidently, then make the user react to drafts. Drafting is the default mode. Asking is the exception.

### The rule

**Once you have brand + tagline + mood, draft all four pages (home / about / contact / welcome post) before asking the user anything else.** Show drafts as a compact preview, not full text:

```
Home    標題 「蚌殼」｜intro 一句話 / body 三句話介紹網站
About   標題 「關於蚌殼」｜講為什麼開這個網站 + 你會寫什麼
Contact 標題 「聯絡」｜email + 一句話歡迎來信
Welcome 標題「水獺與蚌殼的相遇」｜講這個網站的命名故事
```

Then ask: "這個方向對嗎？哪一塊想改？" — single question. The user reacts; you adjust.

### Bad vs good

**Bad** (questionnaire — what we want to stop):

> 4. 首頁介紹：訪客第一眼看到這個網站，你想讓他們讀到什麼？
> 5. About 頁面：這個網站或你自己，你想怎麼介紹？
> 6. Contact 頁面：你希望訪客怎麼聯絡你？
> 7. 第一篇 welcome post：想跟第一個讀者說什麼？

**Good** (draft + react):

> 根據「蚌殼」/「水獺敲蚌殼」/活潑這三個訊號，我幫你起草了四個頁面的方向：[four-line preview]。哪一塊想換掉或補東西？

### Opening when nothing is known

If brand / tagline / mood are not yet set (no website prompt, no prior session), open with **one** question:

> "跟我說說這個網站是給誰看的、你想讓他們感受到什麼？不用想太多，就當聊天。"

Listen, synthesize, and propose brand + tagline + mood as drafts. Then proceed to draft the four pages.

### Resuming from partial state

If brand / tagline / mood come from RUN_NOTES, prior session context, or the website prompt: **draft immediately**, do not re-interview, do not switch into gap-filling questionnaire mode.

### When the user says "up to you"

Generate considered neutral content that fits project name + locales + any signal you have. Present the same compact preview. Move on unless they object.

### End state

Before writing `initial-seed.json`, you must have resolved:

- `brand` — site name (not onboarding copy like "my first AI site")
- `tagline` — footer/metadata one-liner
- `mood` — one of `warm`, `editorial`, `playful`, `technical`, `minimal`; infer from conversation, use closest English equivalent if user described in another language
- home / about / contact / welcome post copy — agent-drafted, user-approved (or user-modified)
- cover image — user-provided URL, or agent picks a neutral Unsplash image that fits the mood

**Multi-locale**: for every locale in `locales`, produce distinct copy. If the user only spoke one language, generate the translations yourself and include them in the preview. Do not ask the user to write the second locale. Do not silently duplicate one locale into all locales.

Write `initial-seed.json` in the consumer root. This is public content, not a secret. Required shape (example for `locales: ["zh-TW", "en"]`):

```json
{
  "brand": "蚌殼",
  "tagline": "水獺敲蚌殼",
  "origin": "https://example.com",
  "locales": ["zh-TW", "en"],
  "mood": "playful",
  "home": {
    "translations": {
      "zh-TW": { "title": "蚌殼", "intro": "水獺敲蚌殼。", "body": "歡迎來到蚌殼..." },
      "en":    { "title": "Mantle Shell", "intro": "An otter knocks on a mantle.", "body": "Welcome to Mantle Shell..." }
    }
  },
  "about": {
    "translations": {
      "zh-TW": { "title": "關於", "intro": "關於蚌殼。", "body": "..." },
      "en":    { "title": "About", "intro": "About Mantle Shell.", "body": "..." }
    }
  },
  "contact": {
    "translations": {
      "zh-TW": { "title": "聯絡", "intro": "與我們聯絡。", "body": "..." },
      "en":    { "title": "Contact", "intro": "Get in touch.", "body": "..." }
    }
  },
  "welcomePost": {
    "slug": "welcome",
    "coverUrl": "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1200",
    "translations": {
      "zh-TW": { "title": "第一篇：歡迎", "body": "..." },
      "en":    { "title": "First post: welcome", "body": "..." }
    }
  }
}
```

Every key in `translations` must appear in `locales`. Do not invent fake credentials, fake staff names, or "AI-generated first site" language.

## POC-Proven Flow Invariants

The older `mantle-poc` starter Skill is still the operational reference. Keep these behaviors unless the current repo proves a better path:

- Use the same GitHub identity across website login, `gh auth`, GitHub OAuth App owner, and `ADMIN_GITHUB_LOGIN`.
- Prefer Cloudflare signup/login through GitHub for non-technical users; it reduces account mismatch.
- For Cloudflare provisioning, prefer a short-lived/scoped dashboard API token for non-technical users. `wrangler login` is only for users comfortable with terminal browser auth.
- If using a Cloudflare API token, never echo it; read with `read -rsp`, keep it temporary, and remind the user to revoke it.
- Do not touch R2, Zero Trust, billing-profile setup, or paid Cloudflare features in the default v0.1.0 path. Cover images use external URLs during first-run provisioning; first-party media hosting is a later explicit opt-in.
- Treat GitHub OAuth App setup as a browser-assisted user step, not something the agent can fully automate.
- The OAuth callback URL must be exact: `<worker_url>/admin/auth/github/callback`.
- The final handoff must include the public URL plus Staff/User MCP URLs.

## Starter Families

Six top-level families define the product taxonomy (#58). Pick the closest fit and fill small gaps inside the chosen starter — do **not** invent a new starter just because one project needs one extra schema or one extra public widget. Starter sprawl makes the agent experience worse.

| Family | Status | What it carries | Not for |
|---|---|---|---|
| `publication` | **available** (`starters/publication`) | Owner-published content — landing pages, articles, docs-lite, project updates, basic contact form, simple public widgets / calculators. | Inventory / order workflows; lead-management pipelines; member-created content; private/paid creator content. |
| `blank` | **available** (`starters/blank`) | Headless API + MCP only. No public HTML, no theme stack. | Anything user-facing without consumer providing their own frontend. |
| `leads-inbox` | planned | Multi-form intake, lead status (new / qualified / contacted / won / lost), assignment, follow-up, source attribution, agent-operated triage. | Owner-published content (basic contact form belongs in `publication`); community-shaped content. |
| `micro-shop` | planned | Products, variants, prices, catalog views, cart / order intent, fulfillment notes, agent-operated order handling, optional payment integration later. | Content-only websites; CRM intake; member content. |
| `booking` | v0.2+ | Services / appointment types, availability windows, booking requests, reminders, cancellation/reschedule, staff/resource assignment. | — |
| `community` | v0.2+ | Member posts, comments, likes, reactions, moderation queue, public profiles/handles, agent-assisted moderation. Requires end-user auth (v0.2). | — |
| `fan-club` | v0.2+ | Public + private posts, member/follower tiers, creator updates, paid/free access boundaries. Requires end-user auth + row-level visibility grammar + Stripe entitlement. | — |

### Closest-fit classification

Classify the request as one of:

- **Within starter shape** — customize copy / theme / seed only. Start the chosen starter, run `setup:site`, seed initial content, done. Most installs land here.
- **Near starter shape** — keep the starter and add small schemas / views / procedures / starter-side custom routes inside the project. Example: `publication` + a public prompt-generator page + one extra Schema. Do **not** fork the starter to do this.
- **Outside starter shape** — switch to a better-fitting starter, or use `blank` and interview for custom 4-atom design. Don't silently mutate `publication` into a shop or community app.

### v0.1.0 install routing

For v0.1.0 first-run bootstrap, the only directly-installable starters are `publication` and `blank`:

- **`publication`** — primary path. It is fixed-manifest during bootstrap; do **not** ask the user to redesign Schemas / Views / Procedures / Triggers. Ask for public copy, visual mood, home/about/contact text, and the welcome post, then seed those into the existing publication model. It currently carries the full Better Auth GitHub OAuth + MCP OAuth/DCR wiring required for MCP.
- **`blank`** — only when the user explicitly wants a headless reference (e.g. they're shipping their own Next.js / Astro frontend). It has the same Better Auth + dual MCP mount shape, but no public HTML.
- **`leads-inbox` / `micro-shop`** — v0.1.0 verticals but ship initially as **documented variants of `publication`** (extra schemas + custom routes added in-project), not as their own starter directory. Do not silently mix vertical-specific schemas into the base `publication` starter; they live in the consumer project.
- **`booking` / `community` / `fan-club`** — refuse for v0.1.0; explain to the user the family lands in v0.2+ and offer `blank` or `publication`-extension as a holding pattern.

Basic contact-form capture belongs in `publication`. `leads-inbox` starts when the user needs **tracking, qualification, assignment, and follow-up workflow** — not just a contact page.

## Preflight

Run these checks:

```bash
node --version
pnpm --version
git --version
```

Requirements:

- Node.js >= 20.
- pnpm >= 9.
- Git available for copying the public starter template.
- Wrangler does not need to be globally installed before scaffold. The copied starter installs Wrangler as a dev dependency; after `pnpm install`, use `pnpm exec wrangler --version`.

GitHub CLI is not required for the npm-first install path. If the website already verified GitHub identity, treat `github_username` as the owner bootstrap value; provision will set it as the `ADMIN_GITHUB_LOGIN` Worker secret.

If the user does not have GitHub or Cloudflare yet:

- GitHub: send them to `https://github.com/signup`.
- Cloudflare: send them to `https://dash.cloudflare.com/sign-up` and prefer "Continue with GitHub".
- After both accounts exist, continue the install. Cloudflare token setup happens in the `provision` Skill.

## Step-by-step

### 1. Resolve install inputs

Normalize:

- `project_name`: lowercase letters, numbers, and hyphens. This becomes `wrangler.toml` `name`.
- `starter`: `publication` or `blank` for v0.1.0 install. Other family slugs (`leads-inbox`, `micro-shop`, etc.) only valid for documented-variant install paths or future v0.2+ starters.
- `locales`: keep order. First locale is canonical.
- `brand`, `description`, `origin`: pass confirmed public copy to `setup:site`. `origin` may stay `https://example.com` until provision knows the Workers URL.
- `mantle_version`: npm package version. Default to the version from the website prompt, currently `0.0.6-alpha`.
- `template_ref`: Git ref used only to copy starter files. For the current npm-first alpha, use `main` unless the website prompt provides a newer release tag. Avoid floating `develop` unless the user is explicitly testing unreleased code.

### 2. Fetch the pinned starter template

Use the public GitHub repo only as a starter template source. Do not build this repo inside the consumer project.

```bash
git clone --depth 1 --branch <template_ref> https://github.com/aotter/mantle.git .mantle-template
```

If `git` is unavailable, ask the user to install Git or download the tagged source zip. Do not require GitHub CLI or tokens for public starter install.

### 3. Copy the starter into the consumer root

Run from the empty target directory:

```bash
cp -R .mantle-template/starters/<starter>/. .
rm -rf .mantle-template
```

Do not copy `.mantle-template` into itself. If the directory is not empty, inspect first and avoid overwriting user files.

### 4. Configure the copied starter

Run the starter-owned setup script before `pnpm install`. Do not hand-edit standard TS/TOML/package setup fields.

```bash
pnpm run setup:site -- \
  --project-name "<project_name>" \
  --brand "<brand>" \
  --description "<description>" \
  --locales "<canonical>,<secondary>" \
  --origin "<origin-or-https://example.com>" \
  --mantle-version "<mantle_version>"
```

The script:

- Updates `wrangler.toml` worker name and D1 database name.
- Updates `src/mantleConfig.ts` site defaults.
- Rewrites copied starter dependencies from `workspace:*` to `@aotter/*@<mantle_version>`.
- Keeps `tsconfig.json` standalone by extending `./tsconfig.base.json`.

Keep `ADMIN_GITHUB_LOGIN` out of source code. It is a Worker secret set by the `provision` Skill using `github_username`.

For local dev admin sign-in, create `.dev.vars` with real GitHub OAuth dev credentials:

```dotenv
GITHUB_CLIENT_ID=<local-dev-client-id>
GITHUB_CLIENT_SECRET=<local-dev-client-secret>
ADMIN_GITHUB_LOGIN=<your-github-login>
BETTER_AUTH_SECRET=<32+ random bytes>
```

Do not commit `.dev.vars`.

### 4.2. Apply visual mood (if user specified one)

If the user answered the "What mood should the site have?" question in Public Copy Intake, apply it now using the theme fork system. **Do not defer this to later and do not touch `src/theme.default/`.**

The starter ships with a read-only baseline at `src/theme.default/`. Consumer overrides live at `src/theme/`. The two directories must never be mixed. The rule is simple:

> **Never edit any file under `src/theme.default/`. All design changes go in `src/theme/` via `pnpm theme:fork`.**

To apply a mood:

```bash
pnpm theme:fork tokens.ts
```

This copies `src/theme.default/tokens.ts` → `src/theme/tokens.ts` and is the only sanctioned way to start customizing tokens. Then edit `src/theme/tokens.ts` — never the `.default/` copy.

```ts
// src/theme/tokens.ts
export const TOKENS_CSS = `
:root {
  --paper: #fffbf3;
  --ink:   #1a1814;
  --accent: #a3331f;
  /* add or override only the vars you need */
}
`;
```

The override is appended after the baseline, so only declare vars you want to change.

If the user wants no design customization at install time, skip this step entirely. Design can be applied later via `skills/customize-design/SKILL.md`.

### 4.5. Prepare initial content seed file

Create `initial-seed.json` from the Public Copy Intake. Keep `origin` as `https://example.com` until provision discovers the real Workers URL.

Do not run `seed:initial` yet. The copied starter has not installed `tsx` or the workspace packages until the next step.

### 5. Install and validate the standalone project

```bash
pnpm install
pnpm exec wrangler --version
pnpm validate
pnpm typecheck
```

After `pnpm install`, verify the seed file renders:

```bash
pnpm run seed:initial -- --seed-file initial-seed.json --dry-run
```

This writes `.mantle-seed.sql` and `.mantle-seed.kv.json` as generated artifacts. They are ignored by git. Do not apply this seed to production during install; provision will run it against remote D1/KV.

For `starters/publication`, fixture data is optional. Use it only if the user wants a local demo site before deployment:

```bash
pnpm fixture
```

Do not treat fixture data as the end-user success path. The v0.1.0 proof uses `initial-seed.json` for first content during provision; MCP is for ongoing operation after owner bootstrap.

Then preview:

```bash
pnpm dev
```

Smoke routes for publication:

- `http://localhost:8787/` should redirect to the canonical locale.
- `http://localhost:8787/<locale>/posts/hello-world` should render only if optional fixture data was applied.
- `http://localhost:8787/<locale>/posts/hello-world.md` should render only if optional fixture data was applied.
- `http://localhost:8787/api/views/recent-posts` should return JSON.
- `POST http://localhost:8787/staff/mcp` without a bearer token should return 401.

Smoke routes for blank:

- `http://localhost:8787/` returns 404 by design.
- `http://localhost:8787/api/views/published-notes` returns an empty JSON result until entries exist.
- `POST http://localhost:8787/mcp` without a bearer token should return 401.

### 6. Hand off to provision

When install is complete, invoke or point to the `provision` Skill with these resolved values:

```yaml
project_name: "<project_name>"
starter: "<starter>"
github_username: "<github_username>"
locales: ["<canonical>", "..."]
mantle_version: "<mantle_version>"
template_ref: "<template_ref>"
seed_file: "initial-seed.json"
```

Provision is responsible for D1/KV creation, GitHub OAuth App setup, Worker secrets, deploy, updating seed origin, applying initial content directly to D1/KV, post-deploy smoke, and returning the Staff/User MCP URLs.

## Diagnostic Recipes

| Symptom | Cause | Fix |
|---|---|---|
| `git clone` cannot access `github.com/aotter/mantle` | Network or Git installation issue | Confirm Git is installed and the repo is public: `https://github.com/aotter/mantle`. |
| `pnpm run setup:site` is missing | Starter was copied from an older template ref | Re-copy from `main` or a newer release tag. |
| `pnpm install` cannot resolve `workspace:*` | `setup:site` was skipped before install | Run `pnpm run setup:site -- ... --mantle-version "<version>"`, then `pnpm install` again. |
| `tsc` tries to read `../../tsconfig.base.json` | Starter was copied from an older template ref | Re-copy from `main` or a newer release tag, or set `extends` to `./tsconfig.base.json`. |
| `Cannot find module @aotter/mantle-*` | npm install did not complete or version is unpublished | Verify `mantle_version`, run `pnpm install`, and check `npm view @aotter/mantle-cloudflare@<version>`. |
| `pnpm validate` exits with `MANIFEST_ROOT_NOT_FOUND` | Not running from consumer root | `cd` to the directory containing `manifests/`. |
| `wrangler dev` boots but admin sign-in fails | GitHub OAuth vars or `BETTER_AUTH_SECRET` missing | Fill `.dev.vars` with `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_GITHUB_LOGIN`, and `BETTER_AUTH_SECRET`, then restart dev. |
| Publication `/llms.txt` or post route 404s locally | Fixture data was not applied | Run `pnpm fixture` and restart `pnpm dev`. |
| `pnpm run seed:initial -- --dry-run` fails on content | `initial-seed.json` is missing required public copy | Add `brand`, `origin`, `locales`, `home`, `about`, and `welcomePost`. |
| Design customization was applied but `src/theme.default/` was edited directly | Agent searched for token file and edited the baseline copy instead of forking | Run `git checkout src/theme.default/` to restore the baseline, then `pnpm theme:fork tokens.ts` and re-apply edits to `src/theme/tokens.ts`. |

## Don't

- Don't ignore starter/locales/GitHub username when the official prompt already provided them.
- Don't require admin UI for v0.1.0 validation. Bootstrap owner + MCP OAuth is enough.
- Don't put `ADMIN_GITHUB_LOGIN`, GitHub client secret, Turnstile secret, or Cloudflare API tokens in git.
- Don't reintroduce stub bearer auth or `MANTLE_ALLOW_STUB_OAUTH`.
- Don't keep `.mantle-template` in the consumer repo after copying the starter.
- Don't write directly to D1 for normal content operations; use runtime/MCP tools. The starter-owned `seed:initial` script is the v0.1.0 exception for first content only.
- Don't add public Schema reads. Public reads go through Views.
- **Don't edit `src/theme.default/`.** It is read-only baseline. Run `pnpm theme:fork <file>` and edit the copy at `src/theme/` instead. Editing `src/theme.default/` directly will be overwritten when the SDK updates and silently diverges from the override system.

## When You're Done

Report:

- Project path and starter used.
- Confirmed GitHub owner username.
- mantle npm package version and template ref.
- Local validation result: `pnpm validate`, `pnpm typecheck`, and starter-specific smoke.
- Next command: use `skills/provision/SKILL.md` to deploy and get the Staff/User MCP URLs.

Do not claim production readiness until provision completes and a second agent can connect through MCP.

## See Also

- [`provision`](../provision/SKILL.md) - D1/KV, secrets, deploy, MCP handoff.
- [`customize-design`](../customize-design/SKILL.md) - publication theme customization.
- [`extend`](../extend/SKILL.md) - adding Schemas, Views, Procedures, and Triggers.

---
name: clam-cms install
description: Bootstrap a new clam-cms consumer project from a website-generated starting prompt. Use when the user pasted a clam-cms prompt that names a starter, GitHub username, locales, and a pinned clam-cms Skill URL, or when the user starts from an empty repo and asks for a blog / headless CMS / MCP-native Cloudflare site.
when_to_invoke: |
  The user is starting from scratch. Strong indicators: empty repo, pasted "Clam CMS install request", no manifests/ directory, no @aotterclam/* deps in package.json.
applies_to: clam-cms@v0.1.0
---

# Install a clam-cms project

You are the agent installing a user-owned clam-cms project. The fastest v0.1.0 path is website-assisted: the official site collects the user's GitHub username, starter choice, and locales, then gives the user a localized starting prompt plus a pinned Skill URL. Treat that prompt as the source of truth unless it is internally inconsistent.

End state for this Skill:

- A standalone consumer project exists in the current directory.
- Dependencies resolve without this repo being the workspace root.
- `pnpm validate` and `pnpm typecheck` pass.
- Local preview can boot.
- The project is ready for the `provision` Skill to create Cloudflare resources and deploy.

## Website Handoff Contract

The official-site prompt should include these fields. Parse them before asking the user anything:

```yaml
clam_cms_request:
  sdk_ref: "<tag-or-commit-sha>"
  skill_url: "https://raw.githubusercontent.com/AotterClam/clam-cms/<ref>/skills/install/SKILL.md"
  starter: "blog" # blog | blank
  github_username: "<verified-by-website>"
  locales: ["en", "zh-TW"] # site content locales; keep codes in payload
  project_name: "<worker-safe-name>"
  brand: "<public brand name>"
  description: "<one-line site description>"
  origin: "https://example.com" # optional placeholder is OK before deploy
```

Website UI rules for `locales`:

- Render locale choices with full native labels, not raw codes or abbreviations.
- Keep the handoff payload as locale codes in `locales`; do not add a separate `prompt_language`.
- The selected state, chips, preview, and any later locale picker should use the same full labels.
- If the user selected only two locales, later selectors must show only those two choices.

Supported website locale options, in display order:

| value | label |
| --- | --- |
| `en` | English |
| `de` | Deutsch |
| `es` | Español |
| `fr` | Français |
| `it` | Italiano |
| `ja` | 日本語 |
| `ko` | 한국어 |
| `pt-BR` | Português (BR) |
| `ru` | Русский |
| `zh-CN` | 简体中文 |
| `zh-TW` | 繁體中文 |
| `id` | Bahasa Indonesia |

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

- `brand` — site name (not onboarding copy like "my first AI blog")
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
      "en":    { "title": "Clam Shell", "intro": "An otter knocks on a clam.", "body": "Welcome to Clam Shell..." }
    }
  },
  "about": {
    "translations": {
      "zh-TW": { "title": "關於", "intro": "關於蚌殼。", "body": "..." },
      "en":    { "title": "About", "intro": "About Clam Shell.", "body": "..." }
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

The older `clam-cms-poc` starter Skill is still the operational reference. Keep these behaviors unless the current repo proves a better path:

- Use the same GitHub identity across website login, `gh auth`, GitHub OAuth App owner, and `ADMIN_GITHUB_LOGIN`.
- Prefer Cloudflare signup/login through GitHub for non-technical users; it reduces account mismatch.
- For Cloudflare provisioning, prefer a short-lived/scoped dashboard API token for non-technical users. `wrangler login` is only for users comfortable with terminal browser auth.
- If using a Cloudflare API token, never echo it; read with `read -rsp`, keep it temporary, and remind the user to revoke it.
- Do not touch R2, Zero Trust, or paid Cloudflare features in the default v0.1.0 path.
- Treat GitHub OAuth App setup as a browser-assisted user step, not something the agent can fully automate.
- The OAuth callback URL must be exact: `<worker_url>/admin/auth/github/callback`.
- The final handoff must include both public URL and MCP URL.

## Starter Choices

| Website option | Starter | What ships |
|---|---|---|
| Blog / marketing / docs landing | `starters/blog` | Public HTML, theme stack, i18n, contact form, sitemap, `.md` mirrors, llms.txt, SEO/AEO meta, `/api/views/*`, `/mcp`. |
| Headless backend / bring-your-own frontend | `starters/blank` | API + MCP only. No public HTML routes. Local/headless authoring reference until its production OAuth wiring matches `blog`. |

`blog` is a fixed-manifest starter. In its bootstrap flow, do not ask the user to redesign Schemas, Views, Procedures, or Triggers. Ask for public copy, visual mood, home/about/contact text, and the welcome post, then seed those into the existing blog model.

If the user wants to design their own workflow at bootstrap time — for example a booking flow, micro-shop catalog/order pipeline, lead inbox, community posts/comments, or internal approval process — use `blank` or a dedicated future starter. That path should interview for the 4 atoms, generate manifests, validate them, and create a starter-specific seed. Do not silently mutate the blog starter into a custom app during first install.

`leads inbox` and `micro-shop` are v0.1.0 validation verticals but may initially be implemented as documented starter variants until dedicated starter directories land. Do not silently mix all verticals into `blog`.

For the first v0.1.0 production proof, prefer `starters/blog`. It currently carries the full GitHub OAuth + Workers OAuth Provider/DCR wiring. Use `starters/blank` only when the user explicitly wants a headless reference and accepts that production MCP OAuth wiring may need to be copied from `blog`.

## Preflight

Run these checks:

```bash
node --version
pnpm --version
gh auth status
```

Requirements:

- Node.js >= 20.
- pnpm >= 9.
- GitHub CLI authenticated as the same account as `github_username`, or the user explicitly confirms the mismatch.
- Wrangler does not need to be globally installed before scaffold. The copied starter installs Wrangler as a dev dependency; after `pnpm install`, use `pnpm exec wrangler --version`.

If the prompt says the website already verified GitHub identity, still check local `gh auth status`. The website identity proves intent; local `gh` identity controls repository access and GitHub OAuth setup.

If the user does not have GitHub or Cloudflare yet:

- GitHub: send them to `https://github.com/signup`.
- Cloudflare: send them to `https://dash.cloudflare.com/sign-up` and prefer "Continue with GitHub".
- After both accounts exist, resume with `gh auth login`. Cloudflare token setup happens in the `provision` Skill.

## Step-by-step

### 1. Resolve install inputs

Normalize:

- `project_name`: lowercase letters, numbers, and hyphens. This becomes `wrangler.toml` `name`.
- `starter`: `blog` or `blank`.
- `locales`: keep order. First locale is canonical.
- `brand`, `description`, `origin`: pass confirmed public copy to `setup:site`. `origin` may stay `https://example.com` until provision knows the Workers URL.
- `sdk_ref`: prefer a tag or full commit SHA. Avoid floating `develop` for user installs unless the user is explicitly testing unreleased code.

### 2. Clone the pinned SDK locally

Keep the SDK inside the consumer repo so the project works before npm publishing:

```bash
gh repo clone AotterClam/clam-cms .clam-cms-sdk
git -C .clam-cms-sdk checkout <sdk_ref>
pnpm -C .clam-cms-sdk install --frozen-lockfile
pnpm -C .clam-cms-sdk build
```

For the private v0.1.0 evaluation path, prefer `gh repo clone` because the user's local GitHub auth is already part of preflight. After the repo is public and `sdk_ref` is a released tag, plain HTTPS clone is also acceptable:

```bash
git clone https://github.com/AotterClam/clam-cms.git .clam-cms-sdk
```

Do not require GitHub Packages or npm publishing for v0.1.0.

### 3. Copy the starter into the consumer root

Run from the empty target directory:

```bash
cp -R .clam-cms-sdk/starters/<starter>/. .
```

Do not copy `.clam-cms-sdk` into itself. If the directory is not empty, inspect first and avoid overwriting user files.

### 4. Configure the copied starter

Run the starter-owned setup script. Do not hand-edit standard TS/TOML setup fields.

```bash
pnpm run setup:site -- \
  --project-name "<project_name>" \
  --brand "<brand>" \
  --description "<description>" \
  --locales "<canonical>,<secondary>" \
  --origin "<origin-or-https://example.com>"
```

The script:

- Updates `wrangler.toml` worker name and D1 database name.
- Updates `src/clamConfig.ts` site defaults.
- Copies `.clam-cms-sdk/tsconfig.base.json` to `./tsconfig.base.json` when running from a pre-npm SDK clone.
- Patches `tsconfig.json` to extend `./tsconfig.base.json`.
- Creates `pnpm-workspace.yaml` with `.clam-cms-sdk/packages/*`.

Keep the starter `package.json` dependencies as `workspace:*` during pre-npm evaluation.

This is a v0.1.0 pre-publish bridge. Do not treat it as the long-term distribution model.

Keep `ADMIN_GITHUB_LOGIN` out of source code. It is a Worker secret set by the `provision` Skill using `github_username`.

Do not set `CLAM_ALLOW_STUB_OAUTH = "1"` in deployable `[vars]`.

For local dev only, create `.dev.vars` if the user wants stub MCP smoke:

```dotenv
CLAM_ALLOW_STUB_OAUTH=1
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

This writes `.clam-seed.sql` and `.clam-seed.kv.json` as generated artifacts. They are ignored by git. Do not apply this seed to production during install; provision will run it against remote D1/KV.

For `starters/blog`, fixture data is optional. Use it only if the user wants a local demo site before deployment:

```bash
pnpm fixture
```

Do not treat fixture data as the end-user success path. The v0.1.0 proof uses `initial-seed.json` for first content during provision; MCP is for ongoing operation after owner bootstrap.

Then preview:

```bash
pnpm dev
```

Smoke routes for blog:

- `http://localhost:8787/` should redirect to the canonical locale.
- `http://localhost:8787/<locale>/posts/hello-world` should render only if optional fixture data was applied.
- `http://localhost:8787/<locale>/posts/hello-world.md` should render only if optional fixture data was applied.
- `http://localhost:8787/api/views/recent-posts` should return JSON.
- `POST http://localhost:8787/mcp` without a bearer token should return 401.

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
sdk_ref: "<sdk_ref>"
seed_file: "initial-seed.json"
```

Provision is responsible for D1/KV/OAUTH_KV creation, GitHub OAuth App setup, Worker secrets, deploy, updating seed origin, applying initial content directly to D1/KV, post-deploy smoke, and returning the MCP URL.

## Diagnostic Recipes

| Symptom | Cause | Fix |
|---|---|---|
| `gh auth status` shows a different user | Browser website login and local CLI login differ | Stop and ask whether to continue with the local account or run `gh auth login` again. |
| `pnpm run setup:site` is missing | Starter was copied from an older SDK ref | Update `.clam-cms-sdk` to a ref that contains `scripts/setup-site.mjs`. |
| `pnpm install` cannot resolve `workspace:*` | `pnpm-workspace.yaml` does not include the local SDK packages | Add `.clam-cms-sdk/packages/*` to the consumer workspace. |
| `tsc` tries to read `/tsconfig.base.json` or another parent path | Starter `tsconfig.json` still points at monorepo root | Copy `.clam-cms-sdk/tsconfig.base.json` to consumer root and set `extends` to `./tsconfig.base.json`. |
| `Cannot find module .../dist/index.js` | SDK was cloned but not built | Run `pnpm -C .clam-cms-sdk install --frozen-lockfile` then `pnpm -C .clam-cms-sdk build`. |
| `pnpm validate` exits with `MANIFEST_ROOT_NOT_FOUND` | Not running from consumer root | `cd` to the directory containing `manifests/`. |
| `wrangler dev` boots but MCP stub fails | `.dev.vars` missing local-only `CLAM_ALLOW_STUB_OAUTH=1` | Add `.dev.vars` for local smoke only. Never put this in deployable `[vars]`. |
| Blog `/llms.txt` or post route 404s locally | Fixture data was not applied | Run `pnpm fixture` and restart `pnpm dev`. |
| `pnpm run seed:initial -- --dry-run` fails on content | `initial-seed.json` is missing required public copy | Add `brand`, `origin`, `locales`, `home`, `about`, and `welcomePost`. |
| Design customization was applied but `src/theme.default/` was edited directly | Agent searched for token file and edited the baseline copy instead of forking | Run `git checkout src/theme.default/` to restore the baseline, then `pnpm theme:fork tokens.ts` and re-apply edits to `src/theme/tokens.ts`. |

## Don't

- Don't ignore starter/locales/GitHub username when the official prompt already provided them.
- Don't require admin UI for v0.1.0 validation. Bootstrap owner + MCP OAuth is enough.
- Don't put `ADMIN_GITHUB_LOGIN`, GitHub client secret, Turnstile secret, or Cloudflare API tokens in git.
- Don't deploy with `CLAM_ALLOW_STUB_OAUTH=1` in `wrangler.toml`.
- Don't keep `.clam-cms-sdk` forever after npm packages exist; it is a pre-publish bridge.
- Don't write directly to D1 for normal content operations; use runtime/MCP tools. The starter-owned `seed:initial` script is the v0.1.0 exception for first content only.
- Don't add public Schema reads. Public reads go through Views.
- **Don't edit `src/theme.default/`.** It is read-only baseline. Run `pnpm theme:fork <file>` and edit the copy at `src/theme/` instead. Editing `src/theme.default/` directly will be overwritten when the SDK updates and silently diverges from the override system.

## When You're Done

Report:

- Project path and starter used.
- Confirmed GitHub owner username.
- Local validation result: `pnpm validate`, `pnpm typecheck`, and starter-specific smoke.
- Next command: use `skills/provision/SKILL.md` to deploy and get the MCP URL.

Do not claim production readiness until provision completes and a second agent can connect through MCP.

## See Also

- [`provision`](../provision/SKILL.md) - D1/KV/OAUTH_KV, secrets, deploy, MCP handoff.
- [`customize-design`](../customize-design/SKILL.md) - blog theme customization.
- [`extend`](../extend/SKILL.md) - adding Schemas, Views, Procedures, and Triggers.

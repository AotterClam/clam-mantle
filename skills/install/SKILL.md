---
name: mantle install
description: Bootstrap a new mantle consumer project from the reference starter. Use when the user says "I want a blog / a docs site / a marketing site backed by an MCP-native CMS" and there isn't already a mantle project in the working directory.
when_to_invoke: |
  The user is starting from scratch. Indicators: empty repo, generic "I want a website", no existing manifests/ directory, no @aotter/* deps in package.json.
applies_to: mantle@v0.1.0
---

# Install a mantle project

You (the agent) are bootstrapping a new mantle consumer for the user. Read this entire file before touching the filesystem. mantle ships two starters in <https://github.com/aotter/mantle>; both deploy to Cloudflare Workers + D1 + KV.

## Pick a starter

Ask the user which surface they need. Don't assume.

| Need | Starter | What ships |
|---|---|---|
| Working public site out of the box (HTML chrome, theme stack, i18n, contact form, sitemap, `.md` mirror, llms.txt, SEO + AEO meta) | **`starters/blog`** | Hono server-rendered, neutral baseline + L1–L4 customization stack. Covers most "I want a blog / marketing site / docs landing" requests. |
| API + MCP backend only (no public HTML); you have your own frontend (Next.js, Astro, SvelteKit, native iOS/Android, partner integration) | **`starters/blank`** | Same SDK, no UI deps, no theme stack. Just `/api/views/*`, `/api/<procedure>`, `/mcp`, `/oauth/*`. |

**Decision shortcuts:**

- If user says "blog" / "marketing site" / "docs site" / "landing page" → `starters/blog`.
- If user already has a frontend project and asks for "headless CMS" / "API for content" / "backend for my Next.js app" → `starters/blank`.
- If the user mentions Astro specifically: `starters/astro` is on the v0.1.x roadmap (issue [#2](https://github.com/aotter/mantle/issues/2)). For now use `starters/blank` and have Astro consume `/api/views/*`.
- If unsure, default to `starters/blog` — easier to grow into; the user can drop `mountPublicRoutes` later if they want headless. Going the other direction (blank → blog) requires re-introducing all the chrome.

The rest of this SKILL is starter-aware: most steps apply to both; sections labeled **(blog only)** or **(blank only)** apply to one starter.

## Preflight

Verify in the user's environment:

```bash
node --version       # ≥ 20
pnpm --version       # ≥ 9
wrangler --version   # 3.x or 4.x; needed for `wrangler dev` + deploy
```

If any are missing, instruct the user to install them — don't auto-install.

Confirm with the user **before** writing code:

1. **Project name** (for `wrangler.toml` `name`).
2. **Site brand + description + locales** (e.g. `["en", "zh-TW"]`). The first locale becomes the canonical fallback.
3. **Origin** (e.g. `https://blog.example.com`) — used in sitemap, llms.txt, OG tags. A placeholder is OK; user can swap later.
4. **Cloudflare account** — confirm they have one and have run `wrangler login`. If not, stop and ask.

## Step-by-step

### 1. Clone the starter into the user's repo

```bash
# Either clone the upstream and copy your chosen starter:
git clone --depth 1 https://github.com/aotter/mantle.git .mantle-tmp
cp -R .mantle-tmp/starters/<blog-or-blank>/. .
rm -rf .mantle-tmp

# Or, when published as a template:
# pnpm dlx @aotter/create-blog <name>
# pnpm dlx @aotter/create-blank <name>
```

### 2. Configure for the user's site

Edit `src/mantleConfig.ts`:

```ts
export const SITE_DEFAULTS = {
  brand: "<user's brand>",
  title: "<user's title>",
  description: "<user's tagline>",
  origin: "<user's origin>",
  locales: ["<canonical>", ...],
};
```

Edit `wrangler.toml`:

- `name = "<project-name>"`
- Update `[[d1_databases]]` `database_name` (run `wrangler d1 create <name>` and paste the returned `database_id`)
- Update `[[kv_namespaces]]` `id` (run `wrangler kv namespace create <BINDING>` and paste returned `id`)

### 3. Install + first validate + first preview

```bash
pnpm install
pnpm validate          # `mantle validate`. Exits 0 with 0 errors.
pnpm dev               # wrangler dev on :8787
```

**(blog only)** Seed example content into local D1 + KV:

```bash
pnpm fixture
```

Visit (blog):

- `http://localhost:8787/` (302 → `/{canonicalLocale}`)
- `http://localhost:8787/{locale}/posts/hello-world`
- `http://localhost:8787/api/views/recent-posts`
- `http://localhost:8787/sitemap.xml`

Visit (blank):

- `http://localhost:8787/` (404 — by design; no public HTML routes)
- `http://localhost:8787/api/views/published-notes` (returns `{ok:true, data:{rows:[]}}` — empty until you create entries)
- `http://localhost:8787/mcp` (returns `unauthorized` without OAuth bearer; the MCP DCR flow is for client tools)

### 4. Stamp generated artifacts (optional but recommended)

```bash
pnpm emit-openapi      # → openapi.json (commit alongside manifests)
pnpm emit-types        # → mantle-types.d.ts (typed handler signatures)
```

Add `mantle-types.d.ts` to `tsconfig.json` `include` so handler files get typed.

## Diagnostic recipes

| Symptom                                                           | Cause                                                                | Fix                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pnpm dev` fails with `Address already in use 8787`               | Another wrangler dev is running                                      | `lsof -ti:8787 \| xargs kill -9`                                                                              |
| `pnpm validate` exits 1 with `MANIFEST_ROOT_NOT_FOUND`            | Working directory has no `manifests/`                                | `cd` to the starter root or pass `--manifests <path>`                                                        |
| `validate` warns `SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES`         | A localized Schema has no matching `siteDefaults.locales`            | Set `locales: ["en", ...]` in `mantleConfig.ts`. CLI can't read site_config; warning is intentional heads-up.   |
| `wrangler dev` boots but `/llms.txt` returns 404                  | Fixture didn't run; KV is empty                                      | `pnpm fixture` then restart wrangler (the empty-suffix bug `llms:` was fixed; root key is now `llms:root`)   |
| `/api/views/<name>` returns 400 INPUT_VALIDATION_FAILED           | Required View param missing from query string                        | Pass the param: `?<name>=<value>` (see `pnpm introspect` for the View's params schema)                       |
| Hono trie matches `/llms.txt` against `/:locale`                  | Literal route registered AFTER param route                           | Always register literals first — the starter does this; if user reorders, route returns 404                 |

## Don't

- Don't add `Schema.spec.expose.rest` or any Schema-level public-read flag — ADR-0012 forbids public reads on Schemas; use Views.
- Don't introduce a second public read URL pattern besides `/api/views/<name>`.
- Don't bypass the entry chokepoint by writing directly to D1 — go through `runtime.createDraft` / `updateDraft` / etc.
- Don't ship `wrangler.toml` with the upstream's database_id / kv id — the user must provision their own.
- Don't enable `lifecycle: editorial` on a Schema yet — boot validator rejects in v0.1.0.
- Don't commit `openapi.json` / `mantle-types.d.ts` to the upstream starter; they're consumer-specific outputs.

## When you're done

Tell the user three things:

1. The dev server URL + the routes worth opening (different list per starter — see "Visit" above).
2. The contents of `openapi.json` if they emitted it (1-line summary: "your API has N operations across M paths").
3. The next typical action — depends on starter:
   - **blog**: customize the design (`customize-design` SKILL — palette, fonts, header, copy) OR add a Schema for real content (`extend` SKILL).
   - **blank**: add a Schema for real content (`extend` SKILL), wire your frontend to `/api/views/<name>`.

## See also

- [`customize-design`](../customize-design/SKILL.md) — L1–L4 theme customization for `starters/blog`.
- [`extend`](../extend/SKILL.md) — adding Schemas / Views / Procedures / Triggers to either starter.
- [`provision`](../provision/SKILL.md) — production deploy (real OAuth, secrets, prod D1/KV, custom domain).

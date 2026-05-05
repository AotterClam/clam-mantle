---
name: mantle provision
description: Take a working mantle project from local-dev to production on Cloudflare. Covers OAuth verifier swap (StubOAuthVerifier → real DCR), wrangler secrets, D1 / KV bindings for prod, environment guardrails, deploy. Use when the user says "let's deploy" / "I want to put this on the internet" / "set up prod".
when_to_invoke: |
  Project exists, runs locally, manifests validate, integration smokes pass. The user explicitly wants to deploy or talk about prod.
applies_to: mantle@v0.1.0
---

# Provision a mantle project for production

## Preflight

Refuse to proceed unless all are true:

```bash
pnpm validate                  # exits 0
pnpm typecheck                 # exits 0
pnpm test                      # all green (workspace-wide if relevant)
pnpm fixture && pnpm dev       # boots; smoke /, /sitemap.xml, /llms.txt, /api/views/*, /api/contact
pnpm view-smoke && pnpm mcp-smoke   # both pass
```

Confirm with the user **before** any `wrangler deploy`:

1. Custom domain? Get the exact hostname.
2. Are they OK with the public site reading the production D1 immediately, or do they want a staging environment first?
3. Do they have an OAuth provider chosen (Google? GitHub? Workers OAuth Provider for first-party DCR)?

## Step-by-step

### 1. Provision Cloudflare resources

```bash
wrangler login
wrangler d1 create <project>-prod        # note returned database_id
wrangler kv namespace create KV          # note returned id
```

Update `wrangler.toml` with the IDs. Keep the `--local` IDs in `[env.dev]` if you want a separate dev binding, or just always pass `--local` to `wrangler d1 execute` for local.

### 2. Run migrations against prod D1

The runtime applies CANONICAL_MIGRATIONS at first boot via `bootInit`, but you can also dry-run:

```bash
# Inspect what bootInit will run:
pnpm exec node -e "import('@aotter/mantle-runtime').then(m => console.log(m.CANONICAL_MIGRATIONS.map(x => x.id)))"
```

First production deploy will migrate automatically.

### 3. Replace StubOAuthVerifier with the real one

The stub accepts `Bearer dev-<userId>` only when `MANTLE_ALLOW_STUB_OAUTH=1`. For prod:

**Don't** carry `MANTLE_ALLOW_STUB_OAUTH=1` into prod `wrangler.toml`. Remove it from `[vars]`.

**Do** wire `@cloudflare/workers-oauth-provider` (DCR-compliant for MCP):

```ts
// src/mantleConfig.ts
import { createWorkersOAuthProvider } from "@cloudflare/workers-oauth-provider";

export function buildCmsConfig(env: Env) {
  return {
    // ...
    bindings: {
      // ...
      oauth: createWorkersOAuthProvider({
        // configure per their docs — provider, scopes, token endpoints
      }),
    },
  };
}
```

The `OAuthVerifier` port shape is documented at `packages/mantle-runtime/src/domain/port/OAuthVerifier.ts`. Anything that implements `verifyAccessToken(req: Request): Promise<{ userId: string } | null>` works; pick a provider that fits the user's identity story.

### 4. Set secrets (never put in `wrangler.toml`)

```bash
# Whatever your handlers reference via env (not tracked in git):
wrangler secret put CAPTCHA_SECRET
wrangler secret put SLACK_WEBHOOK_URL
# ... etc
```

If a Procedure handler reads `env.X`, that env binding must exist. Read `src/handlers.ts` (or wherever) and audit which secrets the user needs.

### 5. Update SiteConfig for production

In `src/mantleConfig.ts`:

```ts
export const SITE_DEFAULTS = {
  // ...
  origin: "https://<production-host>",   // was localhost — sitemap + llms.txt + OG depend on this
};
```

### 6. Stamp generated artifacts at deploy time

```bash
pnpm validate
pnpm emit-openapi > openapi.json
pnpm emit-types > mantle-types.d.ts
pnpm typecheck
```

Commit if not already.

### 7. Deploy

```bash
pnpm deploy            # wraps `wrangler deploy`
```

Output gives the `*.workers.dev` URL. If you registered a custom domain in CF dashboard, requests hit there too.

### 8. Post-deploy smoke

```bash
BASE=https://<your-domain>
curl -s -o /dev/null -w '%{http_code}\n' $BASE/                       # 302
curl -s -o /dev/null -w '%{http_code}\n' $BASE/$LOCALE                 # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/sitemap.xml             # 200
curl -s -o /dev/null -w '%{http_code}\n' $BASE/api/views/recent-posts  # 200
curl -X POST $BASE/mcp                                                  # 401 (no bearer)
```

If `/api/contact` is wired, **don't** smoke it from this script — that creates real entries. Use the user's preferred channel (incognito browser) to verify.

## Diagnostic recipes

| Symptom                                                       | Cause                                                                | Fix                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Worker boots but `/mcp` returns 500 INTERNAL_ERROR            | OAuth verifier not constructed; `MANTLE_ALLOW_STUB_OAUTH` missing      | Either set the env var (dev-only!) or replace with real verifier — boot guard is intentional       |
| `/sitemap.xml` returns wrong domain (`localhost`) on prod     | `siteDefaults.origin` still points to localhost                      | Update `mantleConfig.ts` and redeploy                                                                |
| Boot fails on first prod deploy                               | D1 bind doesn't exist yet OR migrations ran but site_config seed     | Check `wrangler tail` for the BootValidationError; usually `database_name`/`id` mismatch           |
| `/api/contact` 500s on prod                                   | Handler reads `env.CAPTCHA_SECRET` but secret isn't set              | `wrangler secret put CAPTCHA_SECRET`                                                               |
| llms.txt or sitemap missing recent posts                      | KV is per-namespace; prod KV is empty until publish pipeline runs    | Publish entries via admin UI / MCP, OR re-run `pnpm fixture` against prod (ONLY for first deploy)  |

## Don't

- Don't `wrangler deploy` while `MANTLE_ALLOW_STUB_OAUTH=1` is in `[vars]` — guard exists for a reason.
- Don't put secrets in `wrangler.toml` — they end up in version control.
- Don't run `pnpm fixture` against prod KV/D1 unless that's truly what the user wants (it overwrites). Use `--remote` only deliberately.
- Don't expose `/admin/*` routes publicly without OAuth — admin UI lands separately and assumes a verifier.
- Don't deploy to a custom domain until DNS has been pointed at Cloudflare (the user manages this; you can advise but don't assume).
- Don't roll your own OAuth verifier without reading `OAuthVerifier` port docs first — DCR (Dynamic Client Registration) is required for MCP-spec-compliant agent clients.

## When you're done

1. Print the production URL + the post-deploy smoke results.
2. Print the OpenAPI summary (operations + paths) so the user knows what API is now public.
3. Note any prod gaps the user still owns: provisioning DNS, OAuth provider config, monitoring/logging, custom backup of D1.
4. Pointer to the next typical action: `extend` SKILL for adding features, or operational concerns (KV invalidation, content backups) that v0.1.0 doesn't yet automate.

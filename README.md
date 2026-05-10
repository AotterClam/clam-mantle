# clam-cms

**Build your content model by prompting, not configuring.**

Agent-native headless CMS where AI agents are first-class authors — locked-grammar manifests, structured JSON diagnostics, and static `.md` mirrors every agent can crawl without auth. Most CMSes treat AI as a content editor; clam-cms treats it as the developer.

> **0.0.7-alpha prerelease.** This repo is a clean rebuild of the v0.0.x POC. Until v0.1.0 tags, the API surface is in flux. Track the rebuild plan at [#1](https://github.com/AotterClam/clam-cms/issues/1).

## Part of CLAM

**CLAM** (**C**onfig **L**anguage for **A**pps & **M**odeling) is Aotter's family of agent-native config languages. Two halves, one thesis:

- **Apps (OLTP)** — `clam-cms` (this repo) and future apps. Build a content-driven web service by declaring atoms in YAML; the runtime ships dispatcher + auth + render + MCP for free.
- **Modeling (OLAP)** — [`aotter-clam`](https://github.com/aotter/aotter-clam) (sibling project). Turn enterprise Excel/CSV files into Kimball-modeled DuckLake warehouses by declaring star-schema configs in YAML.

> Note: the two halves intentionally live in different GitHub orgs (`AotterClam` for clam-cms, `aotter` for aotter-clam) — different release cadences, different licensing posture.

The shared spirit: **agents write config, runtime carries the complexity**. Hard problems — schema validation, cache invalidation, OAuth, locale canonicalization, JSON Schema → zod conversion, transactional state — live in the runtime, where they're written once by people who understand them. The authoring surface is YAML the agent fills in, where mistakes are caught by structured diagnostics before they become production failures. Non-coders get AI leverage safely; the runtime is the load-bearing part.

This repo is the OLTP side of that thesis applied to web content.

## For AI agents

You're an agent helping a (likely non-technical) user install or extend a clam-cms project.

→ **Install a fresh publication/site** — start at [`skills/install/SKILL.md`](skills/install/SKILL.md).
→ **Add a new atom** (Schema / View / Procedure + http Trigger) to an existing starter — start at [`skills/extend/SKILL.md`](skills/extend/SKILL.md).
→ **Provision Cloudflare resources** (D1, KV, Turnstile) and deploy — start at [`skills/provision/SKILL.md`](skills/provision/SKILL.md).

## For humans

End state: a Cloudflare Worker at `https://<your-site>.<your-account>.workers.dev` with:

- `/admin` — GitHub-OAuth-gated React admin SPA
- `/staff/mcp` — staff MCP endpoint, owner/editor agents connect here to edit content
- `/mcp` — end-user/read MCP endpoint for public View tools and future member flows
- `/<locale>/<collection>/<slug>` — per-entry HTML
- `/<locale>/<collection>/<slug>.md` — agent-friendly markdown mirror
- `/<locale>/llms.txt` — per-locale llms.txt index
- public surface in your taste (the v0.1.0 starter ships Hono + hono/jsx + Tailwind)

For a guided install, follow the steps in [`skills/install/SKILL.md`](skills/install/SKILL.md).

## Packages

| Package | Role |
|---|---|
| `@aotterclam/clam-cms-spec` | Spec engine — types + parse + validate + diagnostics + JSON-Schema → zod converter + CLI. Zero env deps. |
| `@aotterclam/clam-cms-runtime` | Runtime engine — dispatcher + entry-writer + view executor + content-ops + render + MCP. Defines required adapter ports plus optional feature ports. |
| `@aotterclam/clam-cms-admin-ui` | Admin SPA — React 19 + Vite + Tailwind v4. In development; ships in v0.1.0. |
| `@aotterclam/clam-cms-cloudflare` | Cloudflare Workers adapter. Implements ports against D1 / KV / ASSETS and owns Better Auth wiring. |
| `@aotterclam/clam-cms-netlify` | **Stub.** Coming v0.2. Engineering forcing function: keeps `clam-cms-runtime` adapter-agnostic. |

## Starters

Six-family taxonomy (#58). v0.1.0 ships the available rows; the rest are roadmap so agents can pick the closest fit and either fall back to `blank` or wait for the family to land.

| Starter | Family | Status | What |
|---|---|---|---|
| `starters/publication/` | publication | v0.1.0 (available) | Owner-published content — landing pages, articles, docs-lite, project updates, basic contact form. Multi-locale posts/pages, Cloudflare Turnstile, per-slug `.md` mirror, llms.txt, SEO/AEO. |
| `starters/blank/` | — | v0.1.0 (available) | Headless API + MCP only. Drop-in backend for consumers bringing their own frontend (Next.js / Astro / native / partner). |
| `starters/leads-inbox/` | leads-inbox | v0.1.0 (planned) | Multi-form intake + lead status (new / qualified / contacted / won / lost) + assignment + agent-operated follow-up. May ship initially as a documented variant of `publication` before a dedicated directory lands. |
| `starters/micro-shop/` | micro-shop | v0.1.0 (planned) | Small catalog + order intake on pure D1 (~100 orders/day). Stripe Checkout, cookie cart, agent-operated order handling. |
| `starters/booking/` | booking | v0.2+ | Services / availability / appointment requests / reminders / cancellation. Blocks on DO + Queue infra (issue #21). |
| `starters/community/` | community | v0.2+ | Member posts, comments, likes, reactions, moderation queue, agent-assisted moderation. Blocks on end-user auth (v0.2). |
| `starters/fan-club/` | fan-club | v0.2+ | Creator/member content with private posts and membership tiers. Blocks on end-user auth + row-level visibility grammar + Stripe entitlement. |

## Repo conventions

See [`CLAUDE.md`](CLAUDE.md) for in-repo conventions when contributing (PR base branch, manifest grammar lock, ADR discipline, etc.).

## License

Apache 2.0. See [`LICENSE`](LICENSE).

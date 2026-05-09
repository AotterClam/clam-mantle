# mantle

MCP-native headless CMS for Cloudflare Workers. Declarative manifest, AI-first authoring, multi-locale by default.

> **0.0.6-alpha prerelease.** This repo is a clean rebuild of the v0.0.x POC. Until v0.1.0 tags, the API surface is in flux. Track the rebuild plan at [#1](https://github.com/aotter/mantle/issues/1).

## Part of Mantle

**Mantle** (**C**onfig **L**anguage for **A**pps & **M**odeling) is Aotter's family of agent-native config languages. Two halves, one thesis:

- **Apps (OLTP)** — `mantle` (this repo) and future apps. Build a content-driven web service by declaring atoms in YAML; the runtime ships dispatcher + auth + render + MCP for free.
- **Modeling (OLAP)** — [`aotter-mantle`](https://github.com/aotter/aotter-mantle) (sibling project). Turn enterprise Excel/CSV files into Kimball-modeled DuckLake warehouses by declaring star-schema configs in YAML.

> Note: the two halves intentionally live in different GitHub orgs (`aotter` for mantle, `aotter` for aotter-mantle) — different release cadences, different licensing posture.

The shared spirit: **agents write config, runtime carries the complexity**. Hard problems — schema validation, cache invalidation, OAuth, locale canonicalization, JSON Schema → zod conversion, transactional state — live in the runtime, where they're written once by people who understand them. The authoring surface is YAML the agent fills in, where mistakes are caught by structured diagnostics before they become production failures. Non-coders get AI leverage safely; the runtime is the load-bearing part.

This repo is the OLTP side of that thesis applied to web content.

## For AI agents

You're an agent helping a (likely non-technical) user install or extend a mantle project.

→ **Install a fresh publication/site** — start at [`skills/install/SKILL.md`](skills/install/SKILL.md).
→ **Add a new atom** (Schema / View / Procedure + http Trigger) to an existing starter — start at [`skills/extend/SKILL.md`](skills/extend/SKILL.md).
→ **Provision Cloudflare resources** (D1, KV, OAuth, Turnstile) and deploy — start at [`skills/provision/SKILL.md`](skills/provision/SKILL.md).

## For humans

End state: a Cloudflare Worker at `https://<your-site>.<your-account>.workers.dev` with:

- `/admin` — GitHub-OAuth-gated React admin SPA
- `/mcp` — MCP endpoint, AI clients connect here to edit content
- `/<locale>/<collection>/<slug>` — per-entry HTML
- `/<locale>/<collection>/<slug>.md` — agent-friendly markdown mirror
- `/<locale>/llms.txt` — per-locale llms.txt index
- public surface in your taste (the v0.1.0 starter ships Hono + hono/jsx + Tailwind)

For a guided install, follow the steps in [`skills/install/SKILL.md`](skills/install/SKILL.md).

## Packages

| Package | Role |
|---|---|
| `@aotter/mantle-spec` | Spec engine — types + parse + validate + diagnostics + JSON-Schema → zod converter + CLI. Zero env deps. |
| `@aotter/mantle-runtime` | Runtime engine — dispatcher + entry-writer + view executor + content-ops + render + auth + MCP. Defines required adapter ports plus optional feature ports. |
| `@aotter/mantle-admin-ui` | Admin SPA — React 19 + Vite + Tailwind v4. In development; ships in v0.1.0. |
| `@aotter/mantle-cloudflare` | Cloudflare Workers adapter. Implements ports against D1 / KV / ASSETS / Workers OAuth. |
| `@aotter/mantle-netlify` | **Stub.** Coming v0.2. Engineering forcing function: keeps `mantle-runtime` adapter-agnostic. |

## Starters

| Starter | Status | What |
|---|---|---|
| `starters/blog/` | v0.1.0 | Publication/site starter. Multi-locale posts/pages, contact form (Cloudflare Turnstile), per-slug `.md` mirror, llms.txt, SEO/AEO. |
| `starters/leads-inbox/` | v0.1.0 (planned) | Inquiry capture + lightweight CRM queue. May start as a documented variant before a dedicated directory lands. |
| `starters/micro-shop/` | v0.1.0 (planned) | Small catalog + order intake for <100 orders/day. May start as a documented variant before a dedicated directory lands. |
| `starters/social-blog/` | v0.2+ | Likes / comments / private posts. |
| `starters/paid-feed/` | v0.2+ | Subscribe + per-item unlock (OF-style). |

## Repo conventions

See [`CLAUDE.md`](CLAUDE.md) for in-repo conventions when contributing (PR base branch, manifest grammar lock, ADR discipline, etc.).

## License

Apache 2.0. See [`LICENSE`](LICENSE).

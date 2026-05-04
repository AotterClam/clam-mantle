# clam-cms

MCP-native headless CMS for Cloudflare Workers. Declarative manifest, AI-first authoring, multi-locale by default.

> **v0.1.0 in development.** This repo is a clean rebuild of the v0.0.x POC. Until v0.1.0 tags, the API surface is in flux. Track the rebuild plan at [#1](https://github.com/AotterClam/clam-cms/issues/1).

## Part of CLAM

**CLAM** (**C**onfig **L**anguage for **A**pps & **M**odeling) is Aotter's family of agent-native config languages. Two halves, one thesis:

- **Apps (OLTP)** — `clam-cms` (this repo) and future apps. Build a content-driven web service by declaring atoms in YAML; the runtime ships dispatcher + auth + render + MCP for free.
- **Modeling (OLAP)** — [`aotter-clam`](https://github.com/aotter/aotter-clam) (sibling project). Turn enterprise Excel/CSV files into Kimball-modeled DuckLake warehouses by declaring star-schema configs in YAML.

> Note: the two halves intentionally live in different GitHub orgs (`AotterClam` for clam-cms, `aotter` for aotter-clam) — different release cadences, different licensing posture.

The shared spirit: **agents write config, runtime carries the complexity**. Hard problems — schema validation, cache invalidation, OAuth, locale canonicalization, JSON Schema → zod conversion, transactional state — live in the runtime, where they're written once by people who understand them. The authoring surface is YAML the agent fills in, where mistakes are caught by structured diagnostics before they become production failures. Non-coders get AI leverage safely; the runtime is the load-bearing part.

This repo is the OLTP side of that thesis applied to web content.

## For AI agents

You're an agent helping a (likely non-technical) user install or extend a clam-cms project.

→ **Install a fresh blog** — start at [`skills/install-blog/SKILL.md`](skills/install-blog/SKILL.md). _(coming in commit 9 — see [issue #1](https://github.com/AotterClam/clam-cms/issues/1))_
→ **Add a new atom** (Schema / View / Procedure + http Trigger) to an existing starter — start at [`skills/extend-starter/SKILL.md`](skills/extend-starter/SKILL.md). _(coming in commit 9 — see [issue #1](https://github.com/AotterClam/clam-cms/issues/1))_
→ **Provision Cloudflare resources** (D1, KV, OAuth, Turnstile) — common steps live in [`skills/cf-resources/SKILL.md`](skills/cf-resources/SKILL.md). _(coming in commit 9 — see [issue #1](https://github.com/AotterClam/clam-cms/issues/1))_

## For humans

End state: a Cloudflare Worker at `https://<your-site>.<your-account>.workers.dev` with:

- `/admin` — GitHub-OAuth-gated React admin SPA
- `/mcp` — MCP endpoint, AI clients connect here to edit content
- `/<locale>/<collection>/<slug>` — per-entry HTML
- `/<locale>/<collection>/<slug>.md` — agent-friendly markdown mirror
- `/<locale>/llms.txt` — per-locale llms.txt index
- public surface in your taste (the v0.1.0 starter ships Hono + hono/jsx + Tailwind)

`docs/getting-started.md` is the canonical Quickstart. _(coming in commit 9 — see [issue #1](https://github.com/AotterClam/clam-cms/issues/1))_

## Packages

| Package | Role |
|---|---|
| `@aotterclam/clam-cms-spec` | Spec engine — types + parse + validate + diagnostics + JSON-Schema → zod converter + CLI. Zero env deps. |
| `@aotterclam/clam-cms-runtime` | Runtime engine — dispatcher + entry-writer + view executor + content-ops + render + auth + MCP. Defines 5 adapter ports. |
| `@aotterclam/clam-cms-admin-ui` | Admin SPA — React 19 + Vite + Tailwind v4. Pre-built `dist/`. Env-agnostic. |
| `@aotterclam/clam-cms-cloudflare` | Cloudflare Workers adapter. Implements ports against D1 / KV / ASSETS / Workers OAuth. |
| `@aotterclam/clam-cms-netlify` | **Stub.** Coming v0.2. Engineering forcing function: keeps `clam-cms-runtime` adapter-agnostic. |

## Starters

| Starter | Status | What |
|---|---|---|
| `starters/blog/` | v0.1.0 | Single-author blog. Multi-locale posts, contact form (Cloudflare Turnstile), per-slug `.md` mirror, llms.txt. |
| `starters/social-blog/` | v0.2+ | Likes / comments / private posts. |
| `starters/micro-shop/` | v0.2+ | <100 orders/day. |
| `starters/paid-feed/` | v0.2+ | Subscribe + per-item unlock (OF-style). |

## Repo conventions

See [`CLAUDE.md`](CLAUDE.md) for in-repo conventions when contributing (PR base branch, manifest grammar lock, ADR discipline, etc.).

## License

Apache 2.0. See [`LICENSE`](LICENSE).

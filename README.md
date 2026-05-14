# mantle

[![CI](https://github.com/aotter/mantle/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/aotter/mantle/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

**Build your content model by prompting, not configuring.**

Agent-native headless CMS where AI agents are first-class authors — locked-grammar manifests, structured JSON diagnostics, and static `.md` mirrors every agent can crawl without auth. Most CMSes treat AI as a content editor; mantle treats it as the developer.

## Try it cold

```bash
npx https://github.com/aotter/mantle-starters/releases/latest/download/aotter-create-mantle.tgz my-site
cd my-site
```

The scaffolder asks for your archetype + theme + name and produces a Cloudflare-Worker-ready project. See [`skills/install/SKILL.md`](./skills/install/SKILL.md) for the agent-guided flow.

Or paste a two-URL prompt from the landing page at [the legacy MCP test deployment](https://the legacy MCP test deployment/) into Claude Code / Cursor / Codex — same install, friendlier surface.

> **Prerelease.** This repo is a clean rebuild of the v0.0.x POC. Until v0.1.0 tags, the API surface is in flux — alpha and beta releases may introduce breaking changes. Current published versions and channel policy are documented in [`docs/release-process.md`](docs/release-process.md). Track the rebuild plan at [#1](https://github.com/aotter/mantle/issues/1).

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
→ **Provision Cloudflare resources** (D1, KV, Turnstile) and deploy — start at [`skills/provision/SKILL.md`](skills/provision/SKILL.md).

## For humans

End state: a Cloudflare Worker at `https://<your-site>.<your-account>.workers.dev` with:

- `/admin` — React admin SPA, role-gated after sign-in (GitHub / Google / Apple / 30+ social providers, email-OTP, magic-link — adopter picks the methods)
- `/mcp/staff` — staff MCP endpoint, owner/editor agents connect here to edit content
- `/mcp` — end-user/read MCP endpoint for public View tools and future member flows
- `/<locale>/<collection>/<slug>` — per-entry HTML
- `/<locale>/<collection>/<slug>.md` — agent-friendly markdown mirror
- `/<locale>/llms.txt` — per-locale llms.txt index
- public surface in your taste (the v0.1.0 starter ships Hono + hono/jsx + Tailwind)

For a guided install, follow the steps in [`skills/install/SKILL.md`](skills/install/SKILL.md).

## Packages

| Package | Role |
|---|---|
| `@aotter/mantle-spec` | Spec engine — types + parse + validate + diagnostics + JSON-Schema → zod converter + CLI. Zero env deps. |
| `@aotter/mantle-runtime` | Runtime engine — dispatcher + entry-writer + view executor + content-ops + render + MCP. Defines required adapter ports plus optional feature ports. |
| `@aotter/mantle-admin-ui` | Admin SPA — React 19 + Vite + Tailwind v4. In development; ships in v0.1.0. |
| `@aotter/mantle-cloudflare` | Cloudflare Workers adapter. Implements ports against D1 / KV / ASSETS. Ships `createAuth()` — the Better Auth-backed *default* implementation of the SDK's `Auth` contract (see [ADR-0014](docs/adr/0014-auth-better-auth-and-multi-tenant-mcp.md) § "Auth as contract, Better Auth as default"); replace by passing your own `Auth` instance. |
| `@aotter/mantle-netlify` | **Stub.** Coming v0.2. Engineering forcing function: keeps `mantle-runtime` adapter-agnostic. |

## Starters

Six-family taxonomy (#58). v0.1.0 ships the available rows; the rest are roadmap so agents can pick the closest fit and either fall back to `blank` or wait for the family to land.

End-user starters live in the [`aotter/mantle-starters`](https://github.com/aotter/mantle-starters) monorepo. Real-user installs run `npx @aotter/create-mantle <archetype>`, which downloads a pinned source tarball, merges `_common/` + `<archetype>/` into the user's directory, and initializes a fresh user-owned Git repo without `origin` set. Premium / per-customer starters live in the private sibling [`aotter/mantle-starters-premium`](https://github.com/aotter/mantle-starters-premium).

| Starter | Family | Status | What |
|---|---|---|---|
| [`mantle-starters/publication`](https://github.com/aotter/mantle-starters/tree/main/publication) | publication | v0.1.0 (available) | Owner-published content — landing pages, articles, docs-lite, project updates, basic contact form. Multi-locale posts/pages, Cloudflare Turnstile, per-slug `.md` mirror, llms.txt, SEO/AEO. |
| [`mantle-starters/blank`](https://github.com/aotter/mantle-starters/tree/main/blank) | — | v0.1.0 (available) | Headless API + MCP only. Drop-in backend for consumers bringing their own frontend (Next.js / Astro / native / partner). |
| `starters/leads-inbox/` | leads-inbox | v0.1.0 (planned) | Multi-form intake + lead status (new / qualified / contacted / won / lost) + assignment + agent-operated follow-up. May ship initially as a documented variant of `publication` before a dedicated directory lands. |
| `starters/micro-shop/` | micro-shop | v0.1.0 (planned) | Small catalog + order intake on pure D1 (~100 orders/day). Stripe Checkout, cookie cart, agent-operated order handling. |
| `starters/booking/` | booking | v0.2+ | Services / availability / appointment requests / reminders / cancellation. Blocks on DO + Queue infra (issue #21). |
| `starters/community/` | community | v0.2+ | Member posts, comments, likes, reactions, moderation queue, agent-assisted moderation. Blocks on end-user auth (v0.2). |
| `starters/fan-club/` | fan-club | v0.2+ | Creator/member content with private posts and membership tiers. Blocks on end-user auth + row-level visibility grammar + Stripe entitlement. |

## Repo conventions

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — workflow contract for AI + human contributors (branch prefixes, commit shape, PR template, architecture gates).
- [`CLAUDE.md`](CLAUDE.md) — in-repo conventions for agents writing code (PR base branch, manifest grammar lock, ADR discipline, clean-architecture rules).
- [`docs/release-process.md`](docs/release-process.md) — release + publish discipline (channels, dist-tags, deprecation policy, pre-publish checks).
- [`CHANGELOG.md`](CHANGELOG.md) — versioned change log.

## License

Apache 2.0. See [`LICENSE`](LICENSE).

# CLAUDE.md — orientation for AI contributors

This is `@aotterclam/clam-cms-*`: MCP-native headless CMS for Cloudflare Workers, built around a 4-atom YAML manifest model. **v0.1.0 is in development**; until v0.1.0 tags, the runtime is stubbed in places and ships in incremental commits per the plan in [#1](https://github.com/AotterClam/clam-cms/issues/1).

## CLAM thesis (read first)

**CLAM** = **C**onfig **L**anguage for **A**pps & **M**odeling. Aotter's family of agent-native config languages, two halves: this repo (Apps/OLTP) and [`aotter-clam`](https://github.com/aotter/aotter-clam) (Modeling/OLAP). The thesis is the same on both sides:

> **Agents write config; the runtime carries the complexity.**

Concretely, when designing or reviewing a change, ask:

- **Did this push complexity up to the authoring surface?** If a manifest field requires the agent to understand a hidden invariant, the runtime is failing its job. Move the invariant into runtime validation with a structured Diagnostic.
- **Did this make the agent's job harder?** Adding a new manifest key with subtle semantics, a new closed-enum member that's "almost but not quite" like the others, or a runtime behavior that varies by undocumented context — all symptoms of the runtime offloading work onto the author.
- **Can a non-coder safely benefit from this change?** Vibe-coders won't read source code. They paste a URL into Claude Code and trust the agent. If a misuse of the SDK silently corrupts production data instead of surfacing as a `pre-deploy` diagnostic, you've broken the safety promise.

Hard problems live in the runtime. Examples in this repo: schema validation (zod-translated from JSON Schema; Workers-CSP-safe by construction), locale canonicalization (BCP 47 enforced at every layer), OAuth (DCR-compliant out of the box), KV cache invalidation, and entry-writer chokepoint enforcement. Authors never see those — they see the manifest YAML.

This is the lens for every architectural decision in this codebase.

## You're the primary author

> **You (an AI agent) are the expected primary author** of consumer projects that depend on these packages. The SDK's authoring contract is designed for that — see [`docs/adr/0007-ai-as-primary-author.md`](docs/adr/0007-ai-as-primary-author.md). When proposing or reviewing changes, weigh AI-author DX (deterministic CLI feedback, structured JSON diagnostics, fail-fast over runtime errors) alongside human-author DX.

## Where things live

| Path | Purpose |
|---|---|
| `docs/adr/` | Architecture Decision Records — *why* the system is shaped this way. |
| `docs/design-atoms.md` | The 4-atom manifest reference. (Stubbed during v0.1.0 dev.) |
| `docs/getting-started.md` | Human Quickstart. (Stubbed during v0.1.0 dev.) |
| `skills/<name>/SKILL.md` | AI-agent-readable briefs for install / extend / provision flows. Discoverable by URL — no Claude plugin install required. |
| `packages/clam-cms-spec/` | Spec engine. ESM, `sideEffects: false`, zero env / adapter deps. |
| `packages/clam-cms-runtime/` | Runtime engine. Defines the 5 adapter ports. Adapter-agnostic — see "MUST NOT" rule below. |
| `packages/clam-cms-admin-ui/` | React 19 + Vite admin SPA. Pre-built `dist/` consumed via workspace dep by adapters. |
| `packages/clam-cms-cloudflare/` | Cloudflare Workers adapter. Hono-based; binds D1, KV, ASSETS, Workers OAuth. |
| `packages/clam-cms-netlify/` | **README stub.** Coming v0.2. The stub is an engineering forcing function. |
| `starters/blog/` | v0.1.0's single shipping starter. |

## Hard invariants (cross-cutting; never violate)

- **`@aotterclam/clam-cms-runtime` MUST NOT import `D1Database` / `KVNamespace` / any Cloudflare-specific type.** It defines port interfaces; concrete adapters bind them. Violating this collapses the rebuild's reason for existing — the Netlify stub is the public reminder.
- **Manifest grammar is locked at v0.1.** DRAFT keys (see [ADR-0001 §"Future grammar discipline"](docs/adr/0001-four-atom-manifest-model.md)) are documented but **must not** be implemented in code, types, or starter manifests until promoted.
- **Atom name stability**: Schema / View / Procedure / Trigger. No renames.
- **Closed enums for `x-clam-bind` and `ctx.*` predicates** — see (incoming) ADR-0002. New entries go through grammar-revise, not ad-hoc.
- **Cloudflare-only for v0.1.0.** The Netlify package is a README. PG-via-Hyperdrive, Bun, Deno — all v0.2+.
- **`@aotterclam/clam-cms-spec` exports must keep `sideEffects: false`** — the admin SPA depends on tree-shaking; without this flag, importing any subpath drags `yaml` (and at one point `ajv`) into the bundle. zod stays small.
- **Runtime validators use zod (Workers-CSP-safe).** Manifest authoring stays JSON Schema. The JSON-Schema → zod converter lives in `clam-cms-spec/src/json-schema-zod.ts`.
- **PR base branch is `main`.**

## Build / test / typecheck

```bash
pnpm install        # workspace install (pnpm 9, node ≥ 20)
pnpm build          # tsc -b across all packages
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest across all packages
```

Each package has its own `build` / `typecheck` / `test` script that the workspace forwards to.

## Stub policy

Several v0.1.x features ship as **interface defined, impl stubbed** in v0.1.0:

- R2 media uploads — port interface in runtime; CF impl returns NotImplemented
- Sitemap auto-emit — starter ships a hand-rolled `<SitemapStub />`
- Editorial lifecycle — schema accepts `lifecycle: editorial` but boot validator rejects with a clear "v0.1.x" message; starters use `simple` only
- Image variants / OG card generation — not present; lands after R2 impl
- `clam-cms-netlify` package — README only

The "stub" pattern lets consumers compile against the real interface. Replacing the stub with a real impl in v0.1.x doesn't break consumer code.

## Failure modes to avoid (encoded in the ADRs)

- **Adapter coupling creep.** A PR adds a "small convenience" import of `D1Database` in `clam-cms-runtime`. Reject. The whole point of the 5-port boundary is that runtime stays portable.
- **Grammar speculation.** Marking new keys DRAFT until a real use case applies pressure. Locked grammar is more valuable than complete grammar.
- **Doctrine bloat.** Two ways to do the same thing because "doctrine resolves it." Pick one. POC accumulated several of these (Procedure.expose: shortcut, scaffold/ subdir, virtual:cms-config); the rebuild starts clean.

## Migration shape

v0.1.0 ships in 10 commits (see #1's "Initial commit sequence"). Each commit is independently reviewable, typechecks, tests pass. No commit lands without a manual stop-and-review.

After v0.1.0 tags:
- `aotter/clam-cms` (the POC) gets deleted by the user (no redirect — these repos are independent)
- `npm publish` / GitHub Packages decision finalised
- Public-launch banner on the README

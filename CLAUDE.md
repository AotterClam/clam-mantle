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
| `docs/design-references/` | Preserved visual systems from retired starter experiments. Design reference only; not runnable templates. |
| `docs/design-atoms.md` | The 4-atom manifest reference. (Stubbed during v0.1.0 dev.) |
| `docs/getting-started.md` | Human Quickstart. (Stubbed during v0.1.0 dev.) |
| `skills/<name>/SKILL.md` | AI-agent-readable briefs for install / extend / provision flows. Discoverable by URL — no Claude plugin install required. |
| `packages/clam-cms-spec/` | Spec engine. ESM, `sideEffects: false`, zero env / adapter deps. |
| `packages/clam-cms-runtime/` | Runtime engine. Defines the 5 adapter ports. Adapter-agnostic — see "MUST NOT" rule below. |
| `packages/clam-cms-admin-ui/` | React 19 + Vite admin SPA. Pre-built `dist/` consumed via workspace dep by adapters. |
| `packages/clam-cms-cloudflare/` | Cloudflare Workers adapter. Hono-based; binds D1, KV, ASSETS, Workers OAuth. |
| `packages/clam-cms-netlify/` | **README stub.** Coming v0.2. The stub is an engineering forcing function. |
| `starters/blog/` | Reference rendered-blog starter — Hono + theme stack (`theme.default/` + `theme/`) + i18n + contact form + sitemap + SEO/AEO. Use for "I want a website out of the box". |
| `starters/blank/` | Headless API + MCP starter. No UI, no theme stack — drop-in backend for consumers bringing their own frontend (Next.js / Astro / native / partner). |

## Hard invariants (cross-cutting; never violate)

- **`@aotterclam/clam-cms-runtime` MUST NOT import `D1Database` / `KVNamespace` / any Cloudflare-specific type.** It defines port interfaces; concrete adapters bind them. Violating this collapses the rebuild's reason for existing — the Netlify stub is the public reminder.
- **Manifest grammar is locked at v0.1.** DRAFT keys (see [ADR-0001 §"Future grammar discipline"](docs/adr/0001-four-atom-manifest-model.md)) are documented but **must not** be implemented in code, types, or starter manifests until promoted.
- **Atom name stability**: Schema / View / Procedure / Trigger. No renames.
- **Closed enums for `x-clam-bind` and `ctx.*` predicates** — see (incoming) ADR-0002. New entries go through grammar-revise, not ad-hoc.
- **Cloudflare-only for v0.1.0.** The Netlify package is a README. PG-via-Hyperdrive, Bun, Deno — all v0.2+.
- **`@aotterclam/clam-cms-spec` exports must keep `sideEffects: false`** — the admin SPA depends on tree-shaking; without this flag, importing any subpath drags `yaml` (and at one point `ajv`) into the bundle. zod stays small.
- **Runtime validators use zod (Workers-CSP-safe).** Manifest authoring stays JSON Schema. The JSON-Schema → zod converter lives in `clam-cms-spec/src/domain/service/JsonSchemaToZod.ts`.

### Clean-architecture layout (mirrors `aotter-clam/clam/core`)

Both `clam-cms-spec` and `clam-cms-runtime` follow the Aotter clean-architecture convention:

```
kernel ← domain (model + port + service) ← usecase ← infrastructure
```

**Hard rules — enforce on every PR:**

1. `domain/` MUST NOT import from `usecase/`, `infrastructure/`, or the assembly root (`runtime.ts`).
2. `usecase/` MUST NOT import from `infrastructure/`.
3. `kernel/` MUST NOT import from anything except external libs (zod) and other kernel files.
4. `domain/port/` is the ONLY place port interfaces live — never inside a use case file. The package's port surface is fully discoverable by listing `domain/port/`.
5. Use case classes accept request DTOs (`usecase/dto/`); never loose primitives. Each use case has a constructor with explicit port + clock + idgen injection.
6. `infrastructure/` adapters (HTTP / MCP / persistence / render orchestrator) are thin: no business logic, no validation, no transformation — just envelope handling + delegation to a use case.
7. The assembly root (`runtime.ts` for runtime, `index.ts` for spec) is the ONLY place concrete adapters wire to use cases via ports.

**Naming convention** (no `*Port` suffix on ports — Aotter clean-architecture convention):

- `*Repository` for data access (CRUD): `EntryRepository`, `SessionRepository`
- `*Driver` for raw drivers under repositories: `DatabaseDriver`
- `*Cache` for read-mostly stores: `KvCache`
- `*Server` for transport-shaped surfaces: `AssetServer`
- `*Verifier`, `*Reader`, `*Generator`, `*Resolver`, `*Assembler`, `*Orchestrator`, `*Dispatcher`, `*Compiler`, `*Serializer` for narrowly-shaped roles
- `*UseCase` for application services: `CreateDraftUseCase`, `InvokeProcedureUseCase`
- `*Request` / `*Response` suffix for use-case DTOs
- DTOs use enums (e.g. `ContentState`), not strings

**Structural rules:**

- One barrel `index.ts` per folder.
- Adding a new top-level folder under `domain/` / `usecase/` / `infrastructure/` requires an ADR-lite paragraph in the PR description.
- The 5 ADR-0011 ports — `DatabaseDriver`, `KvCache`, `SessionRepository`, `AssetServer`, `OAuthVerifier` — live in `clam-cms-runtime/src/domain/port/`. Concrete impls live in `clam-cms-runtime/src/infrastructure/persistence/` (those backed by `DatabaseDriver`) or in adapter packages (`clam-cms-cloudflare`, future `clam-cms-netlify`).

### Spec/runtime type boundary (separate from layer rules)

- Spec owns: types any spec function takes / returns / validates
  (manifests, `Entry`, `Revision`, `Approval`, `SiteConfig`, closed enums incl.
  `StaffRole`, `Diagnostic`).
- Runtime owns: rows / runtime facts only the dispatcher fills
  (`EntryRow`, `User`, `Staff`, `StaffMembership`, `HandlerContext`, `HandlerFn`).
- Test: does any spec function reference this type? If yes → spec. If only
  runtime ports / use cases / dispatcher do → runtime.

### PR conventions

- **PR base branch is `develop`.** `develop` is the integration branch; `main` only updates at release tags (v0.1.0, v0.1.x, …) via a `develop → main` merge.
- Feature branches cut from `develop`, merge back via `gh pr merge --merge --delete-branch` (NOT `--squash` — see project preference).

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

### Grammar promoted, runtime wired

Two grammar items that were originally committed as v0.1.x are in v0.1.0:

- `Trigger.source.kind: lifecycle` — parser accepts; `LifecycleHookingEntryRepository` decorator wired.
- `Procedure.handler.kind: builtin` — parser accepts; `InvokeBuiltinUseCase` wired.

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

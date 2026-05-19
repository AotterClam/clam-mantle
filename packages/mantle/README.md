# @aotterclam/mantle

Umbrella entry for the Mantle SDK — a manifest-driven CMS for Cloudflare Workers, built around a 4-atom YAML model (Schema / View / Procedure / Trigger) where agents write config and the runtime carries the complexity.

> v0.1.x is in development. APIs may change between minor versions.

## Install

```bash
npm install @aotterclam/mantle@alpha
# or
pnpm add @aotterclam/mantle@alpha
```

## What's inside

Adopters install this one package and import from subpaths. Sub-packages remain individually installable for tooling / alt-adapter authors.

| Subpath | Re-exports |
|---|---|
| `@aotterclam/mantle/spec` (or root) | Manifest grammar, validators, JSON-Schema→Zod, diagnostic catalog (no env / no IO) |
| `@aotterclam/mantle/runtime` | Hexagonal runtime: domain ports, use cases, infrastructure helpers (no adapter deps) |
| `@aotterclam/mantle/cloudflare` | Cloudflare Workers adapter — D1, KV, R2, Better Auth, MCP via `@cloudflare/workers-oauth-provider` |
| `@aotterclam/mantle/admin-ui` | Pre-built React 19 admin SPA bundle |

```ts
import { parseManifestsOrThrow } from "@aotterclam/mantle/spec";
import { createCmsRuntime } from "@aotterclam/mantle/runtime";
import { mountServerEndpoints } from "@aotterclam/mantle/cloudflare";
```

## Getting started

Recommended path: open [mantle.aotterclam.ai](https://mantle.aotterclam.ai/), pick an archetype and theme, then paste the generated prompt into Claude Code / Cursor / Codex. The install Skill asks the right follow-up questions and then runs the scaffolder for you.

Available starter keys and direct scaffolder usage live in [`AotterClam/mantle-starters`](https://github.com/AotterClam/mantle-starters): `presence`, `publication`, `intake`, `transaction`, and `blank`. See `skills/install` in the [Mantle repo](https://github.com/AotterClam/mantle/tree/develop/skills/install) for the full agent-driven install flow.

## Adapter targets

| Adapter | Status |
|---|---|
| Cloudflare Workers | ✅ shipping |
| Netlify | 📋 README stub — engineering forcing function for v0.2 (`@aotterclam/mantle-netlify`) |

The `mantle-runtime` package never imports Cloudflare-specific types — adapters bind concrete drivers (D1 / KV / R2) to the runtime's `domain/port/*` interfaces, so adding a new adapter is a port-implementation exercise, not a refactor.

## Documentation

- [Repo](https://github.com/AotterClam/mantle)
- [4-atom manifest model (ADR-0001)](https://github.com/AotterClam/mantle/blob/develop/docs/adr/0001-four-atom-manifest-model.md)
- [Release process](https://github.com/AotterClam/mantle/blob/develop/docs/release-process.md)
- [Issues](https://github.com/AotterClam/mantle/issues)

## License

Apache-2.0

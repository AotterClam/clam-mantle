# @aotter/mantle

Umbrella entry for the Mantle SDK — a manifest-driven CMS for Cloudflare Workers, built around a 4-atom YAML model (Schema / View / Procedure / Trigger) where agents write config and the runtime carries the complexity.

> v0.1.x is in development. APIs may change between minor versions.

## Install

```bash
npm install @aotter/mantle@alpha
# or
pnpm add @aotter/mantle@alpha
```

## What's inside

Adopters install this one package and import from subpaths. Sub-packages remain individually installable for tooling / alt-adapter authors.

| Subpath | Re-exports |
|---|---|
| `@aotter/mantle/spec` (or root) | Manifest grammar, validators, JSON-Schema→Zod, diagnostic catalog (no env / no IO) |
| `@aotter/mantle/runtime` | Hexagonal runtime: domain ports, use cases, infrastructure helpers (no adapter deps) |
| `@aotter/mantle/cloudflare` | Cloudflare Workers adapter — D1, KV, R2, Better Auth, MCP via `@cloudflare/workers-oauth-provider` |
| `@aotter/mantle/admin-ui` | Pre-built React 19 admin SPA bundle |

```ts
import { parseManifestsOrThrow } from "@aotter/mantle/spec";
import { createCmsRuntime } from "@aotter/mantle/runtime";
import { mountServerEndpoints } from "@aotter/mantle/cloudflare";
```

## Getting started

The fastest path is `npx @aotter/create-mantle@alpha <archetype>`, which scaffolds a starter (presence / intake / transaction / blank) wired to this SDK.

```bash
npx @aotter/create-mantle@alpha presence \
  --project-name my-site \
  --brand "My Site" \
  --description "A short description" \
  --locales en \
  --github-owner my-org \
  --summary "A starter run"
```

See `skills/install` in the [Mantle repo](https://github.com/aotter/mantle) for the full agent-driven install flow.

## Adapter targets

| Adapter | Status |
|---|---|
| Cloudflare Workers | ✅ shipping |
| Netlify | 📋 README stub — engineering forcing function for v0.2 (`@aotter/mantle-netlify`) |

The `mantle-runtime` package never imports Cloudflare-specific types — adapters bind concrete drivers (D1 / KV / R2) to the runtime's `domain/port/*` interfaces, so adding a new adapter is a port-implementation exercise, not a refactor.

## Documentation

- [Repo](https://github.com/aotter/mantle)
- [4-atom manifest model (ADR-0001)](https://github.com/aotter/mantle/blob/main/docs/adr/0001-four-atom-manifest-model.md)
- [Release process](https://github.com/aotter/mantle/blob/main/docs/release-process.md)
- [Issues](https://github.com/aotter/mantle/issues)

## License

Apache-2.0

# ADR-0009: Consumer-supplied manifests at SDK boot

**Status:** Carried over from POC v0.0.x; refreshed for v0.1.0.

**Date**: 2026-05-01 (POC); refreshed 2026-05-03 for v0.1.0 rebuild

**Deciders**: phsu

**Related**: [ADR-0001](0001-four-atom-manifest-model.md) (the manifest model whose authoring path this ADR opens to consumers), [ADR-0007](0007-ai-as-primary-author-sdk-contract.md) (the AI-author DX this unblocks at the per-project layer)

---

## Context

The 4-atom manifest model ([ADR-0001](0001-four-atom-manifest-model.md))
promises that "anything more domain-shaped is composed in the
consumer's project." For that promise to hold, the SDK has to accept
manifest content from the consumer rather than baking any in itself.

The natural failure mode — and the one this ADR forecloses — is the
SDK shipping with a fixed manifest set hand-maintained inside the
package (e.g. a TS string mirror of starter YAML files compiled into
the SDK bundle). A consumer who wants a `comments` Schema, a
`like-post` Procedure, or a cron Trigger then has two bad options:

1. Edit the embedded set inside the SDK (forks the SDK; loses upgrades), or
2. Wait for a future SDK release that ships the manifest they want.

Either option is incompatible with the AI-as-primary-author contract
([ADR-0007](0007-ai-as-primary-author-sdk-contract.md)): the AI is
working *inside the consumer's project*, not inside the SDK monorepo.
It cannot extend the SDK without a fork-and-publish loop that has none
of the three feedback loops the contract guarantees.

Consumer-supplied manifests are the path that keeps the 4-atom model
a property of *the SDK* rather than of *whatever starter the SDK
ships*.

## Decision

The SDK's mount factory accepts manifest YAML text passed in by the
consumer. The SDK ships **zero** embedded manifests; the registry is
built exclusively from what the consumer passes. The resulting
registry feeds the boot validator (`assertBootValid`), the dispatcher
mounter (`mountTriggers`), the View executor, and the MCP
`get_schema` reflection.

```ts
export interface CmsConfig {
  /** Procedure handlers keyed by `Procedure.spec.handler.ref`. */
  readonly handlers?: Readonly<Record<string, AnyHandler>>;
  /** Consumer-authored manifest YAML, one entry per file. Multi-doc
   *  files (`---`-separated) are supported per ADR-0006. The SDK
   *  parses and validates these at boot. */
  readonly manifests?: readonly string[];
}
```

The consumer's config file remains `src/mantleConfig.ts` (unchanged
from v0.0.x). YAML manifests are imported as **Text modules** via
Wrangler's `[[rules]]` block — the standard CF Workers mechanism for
bundling text assets into a Worker without a codegen step:

```ts
// consumer's src/mantleConfig.ts
import postsYaml from "../manifests/posts.yaml";
import contactYaml from "../manifests/contact.yaml";
import { sendContactMessage } from "./handlers/send-contact-message.js";

export const cmsConfig: CmsConfig = {
  manifests: [postsYaml, contactYaml],
  handlers: { "send-contact-message": sendContactMessage },
};
```

```toml
# wrangler.toml — bundle every manifests/*.yaml as text
[[rules]]
type = "Text"
globs = ["**/*.yaml"]
fallthrough = true
```

A small ambient `yaml.d.ts` declaration tells TypeScript that
`*.yaml` imports resolve to a string. The contract the SDK consumes
is just "an array of YAML strings"; how the consumer's bundler
produces them is their choice.

### Adapter scope for v0.1.0

The Cloudflare adapter (`@aotter/mantle-cloudflare`) is the
only shipping adapter in v0.1.0, so the Text-import-via-`[[rules]]`
pattern is the canonical path. When other adapters (Netlify, etc.)
ship, they will need their own equivalent text-import mechanism, but
the SDK boundary remains unchanged: an array of YAML strings in,
parsed registry out.

### Single-slice ship

The grammar lock applies to the spec shape, not to how the SDK ships
internally. v0.1.0 lands consumer-supplied manifests as the only
path from day one — no embedded fallback, no deprecation window, no
override semantics. This is a fresh build with no existing v0.1.x
deployments to migrate.

This means:
- The mount factory requires `manifests` to be passed in for any
  Schema / View / Trigger functionality. Calling it without manifests
  yields an admin-only Worker (no Schema, no View, no Trigger), with
  the boot validator surfacing the empty set as a warning.
- No conflict policy is needed: the SDK ships no manifests, so there
  is no merge surface where an override could disagree with a default.

## Worked example

The v0.1.0 starter ships at `starters/blog/manifests/` and is the
canonical example consumers copy from. It demonstrates the full
pattern: a `posts` Schema, a `contact` multi-doc Procedure + Trigger,
the `[[rules]] type = "Text"` block in `wrangler.toml`, the ambient
`yaml.d.ts`, and the `src/mantleConfig.ts` file that wires manifests
+ handlers into the SDK. The blog `SKILL.md` walks AI install agents
through the sequence.

## Consequences

### Pros

- Consumers can compose all four atoms in their own project per the
  ADR-0001 promise. The 4-atom model is a property of the SDK, not
  of the starters.
- The static-validation feedback loop (`mantle validate`) reads
  from a `manifests/` directory in the consumer's project; the
  validate path is uniformly applicable to consumer-authored
  manifests across all four feedback loops.
- The SDK bundle ships no manifest content. Consumers who don't need
  a given starter's atoms (e.g. a docs site that only uses
  `posts`-shaped content) don't pay for unrelated atoms.
- Text-imported YAML keeps manifests as the YAML source-of-truth on
  disk — no codegen step in the build, no parser drift between
  author-time YAML and runtime parse. Multi-doc YAML grouping
  (ADR-0006) is preserved end-to-end.
- The MCP `get_schema` reflection automatically picks up the
  consumer's atoms — no separate registration call. The consumer
  adds a `comments` Schema and the AI editor sees it the next deploy.

### Costs

- The consumer project carries a `manifests/` directory, a
  `wrangler.toml` `[[rules]]` block, and a `src/yaml.d.ts` ambient
  declaration. The install agent has these files to copy and one
  more import to wire (the blog `SKILL.md` covers the sequence).
- Text imports for YAML are a property of the consumer's build
  system, not the SDK. Consumers using a non-standard build need to
  ensure their bundler resolves `*.yaml` to a string. This is a
  documentation issue, not a contract change — alternative paths
  (codegen, embedded literal, fetch from KV) all work the same way
  at the SDK boundary as long as they yield a string.
- Boot validation needs to surface "the consumer wrote invalid YAML"
  clearly. The diagnostic's `path` field references the consumer
  file (e.g. `consumer-manifest:[2]#/spec/...`) so deploy logs point
  at the right file.

### Risks

- **Build-step coupling.** Text imports depend on the consumer's
  bundler. If a future Wrangler version changes the `[[rules]]`
  surface the docs need updating. Mitigation: spec the import
  contract loosely — "a string carrying the YAML text" — so any
  other path (codegen, embedded literal, `fetch` from KV) works the
  same way at the SDK boundary.
- **Manifest drift between dev and prod.** The consumer edits a YAML
  file; until they re-run `wrangler deploy`, the runtime keeps
  serving the previous bundle. This is the existing Worker dev-loop;
  the validate CLI catches the static checks pre-deploy and the
  boot validator catches handler-ref mismatches at deploy. No new
  risk; just call out in the docs that "rebuild required after
  manifest edit."
- **Multi-tenant deployments amplifying conflict.** A single Worker
  running multiple tenants would want each tenant's manifests
  isolated. The atom model has no `namespace` field
  ([ADR-0001](0001-four-atom-manifest-model.md)) on purpose —
  multi-tenancy lives in the consumer app layer with `tenant_id`
  columns. Consumer-supplied manifests don't change this; the SDK
  still sees one flat manifest set per Worker. Multi-tenant
  SaaS-on-this-CMS is a separate design question.
- **Manifest set growth.** A large consumer (50+ Procedures, 20+
  Schemas) makes per-file imports verbose. Mitigation: a future
  ergonomic helper (`loadManifestsFromGlob`) can be added without
  changing the SDK contract — the contract is "pass an array of YAML
  strings"; how the consumer assembles the array is their choice.

## Alternatives considered

**(A) `manifests: readonly Manifest[]`** — pre-parsed manifest
objects instead of YAML strings. Rejected: pre-parsing means the
consumer must call `parseManifests` themselves, losing multi-doc
YAML grouping unless they call it once per file. The SDK already
parses YAML inside its boot pipeline; pushing parse responsibility
to the consumer is unforced complexity. Diagnostic paths also
degrade: parse errors surface as JS exceptions in consumer code,
not as Diagnostic JSON tied to a file path.

**(B) Filesystem-based manifest discovery** — SDK reads manifests
from `process.cwd()/manifests/*.yaml` at boot. Rejected: Workers do
not have a runtime filesystem. Even at build time, Wrangler doesn't
provide a hook for the SDK to read consumer files — that's the
consumer's bundler's job, which is exactly what Text-imported YAML
is for.

**(C) Separate `@aotter/mantle-manifests-<consumer>` package** —
each consumer ships their manifests as an npm package; the SDK
imports from `mantle-manifests-blog` etc. Rejected: 1:N package
overhead for what should be a directory of YAML files. Tooling pain
(versioning, publishing) for a layer that is fundamentally
consumer-internal. Useful if a community emerges around shared
manifest sets ("here's a forum schema as a package"), but YAGNI for
the v0.1 baseline — that ergonomic can be added later by a wrapper
that calls the mount factory with `pkg.manifests`.

**(D) Embed manifests in the SDK and ignore the question** — ship
the SDK with a fixed manifest set baked in. Rejected: fails the
ADR-0001 promise and the AI-author contract. The SDK is supposed to
be content-agnostic; making it content-prescriptive permanently is
a strategic mistake.

**(E) Override semantics for conflicts** — last-write-wins, with the
consumer's manifest beating the SDK's. Rejected: only relevant if
the SDK ships embedded manifests alongside consumer ones. With the
SDK shipping zero manifests there is no conflict surface.

## How to apply

When proposing a new SDK feature that depends on knowing the
manifest set (e.g. a new admin UI screen, a new MCP reflection
method), assume the manifest set is consumer-owned. Don't hardcode
collection names; iterate `getRegistry().schemas`. Don't assume the
SDK knows about `posts`; it doesn't.

When writing or reviewing the install agent's path, the agent must:
1. Copy the relevant `starters/<name>/` contents into the consumer's
   project. The starter is self-contained — `manifests/`,
   `src/yaml.d.ts`, the `[[rules]] type = "Text"` block in
   `wrangler.toml`, and `src/mantleConfig.ts` all come along.
2. Wire `import postsYaml from "../manifests/posts.yaml"` (and
   peers) in `src/mantleConfig.ts`. No `?raw` suffix needed —
   Wrangler's text rule covers plain imports.
3. Pass `manifests: [postsYaml, contactYaml, ...]` in the exported
   `cmsConfig` object.

The blog `SKILL.md` walks this sequence.

## Implementation status

Accepted for v0.1.0. The implementation slice:

- `CmsConfig` carries `manifests?: readonly string[]`.
- The mount factory builds the registry from the consumer-supplied
  YAML; no SDK fallback.
- The `@aotter/mantle-cloudflare` package ships zero embedded
  manifests; no `STARTER_MANIFESTS_YAML` constant exists.
- The starter at `starters/blog/` is self-contained: `manifests/`,
  `src/yaml.d.ts`, `wrangler.toml` `[[rules]]` block, and
  `src/mantleConfig.ts` wiring it together.
- Boot validator's `path` field on `INVALID_MANIFEST_ENVELOPE`-class
  errors uses the consumer-supplied YAML index
  (e.g. `consumer-manifest:[2]#/spec/...`) so deploy logs point at
  the right file.

Tracking: aotter/mantle.

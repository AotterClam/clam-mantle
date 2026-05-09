# ADR-0013: Media fields use URL-first semantics; storage is optional

## Status

Accepted (new)

## Date

2026-05-09

## Context

The publication/site starter needs image-shaped fields immediately:
cover images, OG cards, future product photos, and admin form widgets.
Agents also need a stable hint so they can ask for or generate media
without guessing which string fields are URLs.

At the same time, first-run onboarding must stay free on `workers.dev`.
Cloudflare R2 is attractive for first-party media hosting, but enabling
R2 can introduce billing-profile / credit-card friction. Making R2 part
of the default path would break the core product promise: a non-coder
can paste a prompt into an agent and get a production-ready site online
without paid Cloudflare setup.

## Decision

Media-shaped content is represented first as ordinary string URL fields
in Schema manifests. The conventional `x-mcp-hint` values
`media`, `media-image`, `media-video`, and `media-file` tell agents and
admin widgets that a field is media-shaped, but they do not imply a
first-party media store.

The v0.1.0 default path uses public external URLs. A starter may seed
Unsplash, user-provided CDN URLs, or another externally hosted URL into
the field. This keeps D1/KV-only provisioning viable.

Runtime may define optional feature ports:

- `MediaStorage` — object-storage-shaped upload / commit / public URL /
  delete contract.
- `RemoteMediaFetcher` — policy-gated remote URL ingestion contract.

These ports are optional. They must not be required by `createCmsRuntime`,
boot validation, first-run provisioning, or the Cloudflare adapter's
minimum bindings.

Cloudflare R2 is one possible `MediaStorage` implementation. It is an
explicit opt-in add-on, not a release gate for the first-run starter.
Provision skills must not create R2 buckets, request billing setup, or
mention credit cards unless the user explicitly asks for first-party
media hosting.

Future upload flows should keep the same field shape. Browser admin UI
can request a short-lived upload URL, upload directly to storage, commit
the asset, then write the resulting public URL to the Schema field. MCP
agents can either supply an external URL or, when an adapter advertises
media support, use the same storage flow.

SVG ingestion is default-off for hosted uploads unless a consumer
explicitly enables it. Remote ingestion should do policy checks before
commit, including HTTPS-only defaults, allowed MIME types, max bytes,
redirect limits, and commit-time metadata verification.

## Consequences

- The data model stays portable: a media field is still a URL string.
- Starters can ship useful cover-image experiences before first-party
  media hosting exists.
- R2 work can proceed without polluting runtime or provision UX with
  Cloudflare-specific required bindings.
- Admin UI can surface media affordances from manifest metadata without
  assuming upload hosting is available.
- Consumers that need asset lifecycle, variants, or deletion semantics
  must opt in to a storage adapter later.

## Alternatives

- **Require R2 for publication starters.** Rejected because it can break
  zero-cost onboarding and pulls Cloudflare shape into the core path.
- **Create a first-class `media` Schema now.** Rejected for v0.1.0
  because URL-first fields cover the immediate authoring need without
  adding cross-row lifecycle and garbage-collection semantics.
- **Use free-form field names only.** Rejected because agents and admin
  widgets need explicit intent metadata; `x-mcp-hint` is the stable
  low-friction signal.

## How to apply

- For cover images or similar fields, use `type: string`,
  `format: uri`, and `x-mcp-hint: media-image`.
- Do not add required R2 bindings to starters or default provisioning.
- Do not make optional media ports part of the required adapter contract.
- If adding hosted uploads, keep the persisted value as the public URL.
- If adding media widgets, read `x-mcp-hint`; do not infer from field
  names alone.

## Implementation status

Implemented as the first #57 slice:

- `@aotter/mantle-spec` declares conventional media hints.
- Runtime exports optional `MediaStorage` and `RemoteMediaFetcher`
  feature ports.
- The publication/blog starter marks `posts.coverUrl` as
  `x-mcp-hint: media-image`.
- MCP tool schemas preserve the hint for agents.
- `/admin/api/collections` exposes media-shaped fields for admin UI.
- Install/provision skills explicitly keep R2 out of first-run
  provisioning.

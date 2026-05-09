# `@aotter/mantle-netlify` — STUB

Netlify Functions adapter for mantle. **Coming v0.2.**

This package is intentionally empty in v0.1.0.

## Why does this package exist if it has no code?

It exists as an **engineering forcing function**.

The 7 required adapter ports defined in `@aotter/mantle-runtime` (DatabaseDriver / KvCache / SessionRepository / AssetServer / OAuthVerifier / UserRepository / StaffRepository) only stay adapter-agnostic if there's pressure to implement them in more than one place. Optional feature ports, such as media hosting, must stay optional until a starter explicitly enables that feature. With only `mantle-cloudflare` shipping, `mantle-runtime` would slowly grow Cloudflare-specific imports in PR review (`D1Database` here, `KVNamespace` there) — death by a thousand papercuts. After a year, "adapter-agnostic" is a comment, not a constraint.

This README declares the public commitment to a second adapter. PR reviewers can point at this directory when blocking a CF-coupling slip.

## What v0.2 will ship

- Netlify Functions handler (replaces Cloudflare Workers' Hono adapter)
- `DatabaseDriver` → Postgres-via-Neon impl, OR Netlify Blob storage if first-party support exists
- `KvCache` → Netlify Blobs (or Redis bridge)
- `SessionRepository` → cookie-session over Postgres
- `AssetServer` → Netlify static publish dir (consumes `mantle-admin-ui` dist same as Cloudflare)
- `OAuthVerifier` → standalone OAuth provider (no Workers-OAuth-Provider equivalent on Netlify)
- `UserRepository` → Postgres impl for user identity + GitHub token storage
- `StaffRepository` → Postgres impl for staff roster + bootstrap owner

The port interface is documented in [`docs/adr/0011-adapter-port-spec.md`](../../docs/adr/0011-adapter-port-spec.md). _(Authored in commit 2.)_

## Want this sooner?

Open an issue. Implementation work for the second adapter is a discrete chunk; once started, ~2 weeks if the port spec holds up.

## Until v0.2

Use [`@aotter/mantle-cloudflare`](../mantle-cloudflare/README.md). Cloudflare Workers gives you D1 + KV + ASSETS + Workers-OAuth-Provider in one place at zero cost (no credit card needed for the v0.1.0 starter set).

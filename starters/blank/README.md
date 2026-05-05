# `starters/blank`

**Headless CMS starter.** Ships zero UI. Use this when you have your own
frontend (Next.js, Astro, SvelteKit, native iOS/Android, partner
integration) and want mantle purely as a content + auth + MCP backend.

If you want a working public site out of the box with HTML chrome,
i18n, theme stack, and contact form, use [`starters/blog`](../blog)
instead.

## URL surface

```
GET  /api/views/<name>            view REST per View atom
ALL  /api/<procedure>             procedure dispatcher (POST / PUT / PATCH / DELETE)
ALL  /mcp                         MCP JSON-RPC dispatcher
```

No public read routes (`/{locale}/...`, `/sitemap.xml`, `.md` mirrors,
`llms.txt`). Add `mountPublicRoutes` from
`@aotter/mantle-cloudflare` if you change your mind.

### Auth

MCP requests must carry a verified bearer token. The runtime's
`OAuthVerifier` port (`StubOAuthVerifier` for dev,
`MANTLE_ALLOW_STUB_OAUTH=1` env-gated) does the verification — there is
no `/oauth/{authorize,token,register}` route mount in v0.1.0. A real
OAuth 2.1 / DCR endpoint mount via `@cloudflare/workers-oauth-provider`
is a v0.1.x follow-up; until it lands, MCP clients need an
out-of-band token.

## Layout

```
starters/blank/
├── manifests/example.yaml     # one-file demo: Schema + View
├── src/
│   ├── index.ts               # worker entrypoint (mountServerEndpoints + mountMcp)
│   ├── mantleConfig.ts          # env + manifests + handlers wiring
│   ├── loadManifests.ts
│   ├── handlers/index.ts      # empty registry — add Procedure handlers here
│   └── types.d.ts
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## Getting started

```bash
pnpm install
pnpm dev      # wrangler dev — http://localhost:8787
```

Hit `GET http://localhost:8787/api/views/published-notes` to see the
example View executing against an empty `notes` collection.

## Replacing the example

1. Open `manifests/example.yaml`.
2. Edit or replace the `Schema` and `View` to match your content.
3. If you need server-side Procedures (form handlers, webhooks, etc.),
   add a `Procedure` atom and register the handler in
   `src/handlers/index.ts`.
4. Validate with `pnpm validate` (runs the spec CLI).

## What you get from the SDK

`@aotter/mantle-cloudflare` mounts the routes above against
`@aotter/mantle-runtime` use cases. Nothing is starter-specific
once you've wired the bindings — auth, MCP DCR, view executor, and
procedure dispatcher all come straight from the SDK.

If your frontend renders posts (or anything you'd like to expose for
LLM crawlers), the runtime can ship an `.md` mirror of any entry; see
`@aotter/mantle-runtime/serializeEntryAsMarkdown` and
`composeLlmsTxt`.

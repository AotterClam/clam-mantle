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
GET  /admin/api/*                 admin REST (when admin SPA ships)
GET  /oauth/{authorize,token,...} OAuth 2.1 / DCR for MCP clients
```

No public read routes (`/{locale}/...`, `/sitemap.xml`, `.md` mirrors,
`llms.txt`). Add `mountPublicRoutes` from
`@aotter/mantle-cloudflare` if you change your mind.

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

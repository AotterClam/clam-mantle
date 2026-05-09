# `starters/blank`

**Headless CMS starter.** Ships zero UI. Use this when you have your own
frontend (Next.js, Astro, SvelteKit, native iOS/Android, partner
integration) and want clam-cms purely as a content + auth + MCP backend.

If you want a working public site out of the box with HTML chrome,
i18n, theme stack, and contact form, use [`starters/publication`](../publication)
instead.

## URL surface

```
GET  /api/views/<name>            view REST per View atom
METHOD <trigger path>             manifest-declared HTTP Trigger routes
ALL  /staff/mcp                   Staff MCP JSON-RPC dispatcher
ALL  /mcp                         User/read MCP JSON-RPC dispatcher
```

No public read routes (`/{locale}/...`, `/sitemap.xml`, `.md` mirrors,
`llms.txt`). Add `mountPublicRoutes` from
`@aotterclam/clam-cms-cloudflare` if you change your mind.

### Auth

MCP requests must carry a verified bearer token. The runtime's
Cloudflare adapter now uses Better Auth for browser sign-in and MCP
OAuth/DCR. `publication` wires the production-ready dual MCP surface
(`/staff/mcp` for staff authoring, `/mcp` for end-user/read tools).
`blank` wires the same Better Auth factory and dual mounts, but ships
no public HTML. Add your own frontend and policy surface before
claiming a custom production workflow.

## Layout

```
starters/blank/
├── manifests/example.yaml     # one-file demo: Schema + View
├── src/
│   ├── index.ts               # worker entrypoint (mountServerEndpoints + mountMcp)
│   ├── clamConfig.ts          # env + manifests + handlers wiring
│   ├── loadManifests.ts
│   ├── handlers/index.ts      # empty registry — add Procedure handlers here
│   └── types.d.ts
├── package.json
├── tsconfig.json
└── wrangler.toml
```

## Getting started

```bash
pnpm run setup:site -- \
  --project-name "clam-blank" \
  --brand "Clam Blank" \
  --description "Headless CMS — bring your own frontend." \
  --locales "en" \
  --origin "https://example.com"
pnpm install
pnpm dev      # wrangler dev — http://localhost:8787
```

Hit `GET http://localhost:8787/api/views/published-notes` to see the
example View executing against an empty `notes` collection.

## Replacing the example

1. Open `manifests/example.yaml`.
2. Edit or replace the `Schema` and `View` to match your content.
3. If you need server-side Procedures (form handlers, webhooks, etc.),
   add a `Procedure` atom, bind it with a `Trigger.source.kind: http`,
   and register the handler in `src/handlers/index.ts`.
4. Validate with `pnpm validate` (runs the spec CLI).

## What you get from the npm packages

`@aotterclam/clam-cms-cloudflare` mounts the routes above against
`@aotterclam/clam-cms-runtime` use cases. Nothing is starter-specific
once you've wired the bindings — bearer-token MCP auth, view executor,
and HTTP Trigger dispatcher all come straight from the runtime packages.

If your frontend renders posts (or anything you'd like to expose for
LLM crawlers), the runtime can ship an `.md` mirror of any entry; see
`@aotterclam/clam-cms-runtime/serializeEntryAsMarkdown` and
`composeLlmsTxt`.

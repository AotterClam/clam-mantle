---
archetype: blank
status: ready
starter_repo: AotterClam/clam-cms-starters
starter_path: blank
overlays: []
applies_to: clam-cms@v0.1.0
---

# `blank` archetype

Follow [the install SKILL](../SKILL.md). The Mantle voice rules from that SKILL apply only when writing the welcome letter — the register hints below feed into `card1` and `card3` of that letter.

## What this is

Headless CMS backend — API + MCP only, no public HTML. The user is bringing their own frontend (Next.js / Astro / SvelteKit / iOS / partner integration) and wants clam-cms purely as content + auth + MCP. Schema design happens **after** deploy through the `extend` skill.

## Interview probes to emphasize

- Confirm "bring your own frontend" explicitly. If the user expects public HTML, route them to `publication` instead.
- Which frontend? (Inform card3 — the first-prompt example should reference their stack.)
- What is the first Schema they want? (Defer the design; just capture the noun. They will design it through `extend`.)
- Will the frontend talk to `/staff/mcp` (write) or `/mcp` (read) — or both?

## Site defaults

- **Mood default:** from interview; no archetype-level default. The user is technical-leaning if they chose `blank`.
- **card1 verb register:** technical-active. (zh-TW illustrative: "後端準備好了", "API 上線了"; EN illustrative: "the backend is up", "API is live". Match the user's own register.)
- **Avoid:** marketing voice; "your beautiful new site" language — they explicitly opted out of UI.

## Editor first-prompt template (becomes card3 body)

```text
打開後台，先列出目前的 collections（example 應該還在）。再讓我看一下 /api/views/published-notes 在空 collection 下回什麼。然後 propose 一個第一個真正要用的 Schema 草稿 — 我會直接改 manifests YAML，不要 apply。
```

(EN illustrative:)
```text
Open the admin and list current collections (the example one should be there). Show me what /api/views/published-notes returns against an empty collection. Then propose a draft Schema for the first real one we'll use — I'll edit the YAML manifest directly; don't apply yet.
```

## Schema/View/Procedure extensions

Defer all schema design to [`skills/extend/SKILL.md`](../../extend/SKILL.md). The starter ships exactly one demo Schema/View (`notes` / `published-notes`); during install, do **not** add custom manifests. The user designs theirs after deploy.

## See also

- [`extend`](../../extend/SKILL.md) — designing the user's real Schemas / Views / Procedures / Triggers.

---
archetype: publication
status: ready
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
applies_to: mantle@v0.1.0
---

# `publication` archetype

Follow [the install SKILL](../SKILL.md). The Mantle voice rules from that SKILL apply only when writing the welcome letter — the register hints below feed into `card1` and `card3` of that letter.

## What this is

A site that publishes — articles, notes, project updates, a docs-lite section, plus a basic contact form. The `publication` starter carries the Schemas (`posts`, `post-translations`, `pages`, `contact-messages`), the public read path via KV, and the lifecycle/Procedure scaffolding for CAPTCHA + Slack-notify.

## Interview probes to emphasize

- Are you the only author, or will there be more later? (Affects how the bootstrap-owner-only constraint reads.)
- Publishing rhythm — irregular, weekly, daily? Often informs voice.
- Is the contact form actually wanted, or is presence enough? (Skip if not — the form takes Turnstile config.)
- Do you write in two languages? Which is canonical? (`post-translations` joins on slug.)

## Site defaults

- **Mood default:** editorial / playful. Heavier than `presence` but still grounded.
- **card1 verb register:** active. (zh-TW illustrative: "開站", "上線", "可以開始寫了"; pick the natural verb that says "this is open to publish".)
- **Avoid:** SEO-marketing voice. The user almost never opened with "I want to rank for X."

## Editor first-prompt template (becomes card3 body)

```text
打開後台，列出 posts collection（應該還空著）。然後幫我起一篇 "Hello, {{BRAND}}" 的草稿：一段話介紹這站、一段話講為什麼存在。語氣參考 mantle/site.md 的 voice。先存成 draft，我看過再發佈。
```

(EN illustrative:)
```text
Open the admin and list the posts collection (should be empty). Draft a "Hello, {{BRAND}}" post: one paragraph introducing the site, one paragraph on why it exists. Match the voice in mantle/site.md. Leave as draft so I can review before publishing.
```

## Schema/View/Procedure extensions

None. The base starter carries everything. If the user wants newsletter signup, search, or a public widget on top of `publication`, route them to [`skills/extend/SKILL.md`](../../extend/SKILL.md) **after** deploy — don't add manifests during install.

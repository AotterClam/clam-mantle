---
archetype: presence
status: ready
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
applies_to: mantle@v0.1.0
---

# `presence` archetype

Follow [the install SKILL](../SKILL.md). The Mantle voice rules from that SKILL apply only when writing the welcome letter — the register hints below feed into `card1` and `card3` of that letter.

## What this is

A small public site that exists to **be there** — a brand page, an event page, a personal page, a quiet hotel-lobby kind of presence. Light on content, heavy on tone. Backed by the `publication` starter; first content created after deploy through Editor MCP.

## Interview probes to emphasize

- **What single thing** do you want a first visitor to feel or remember?
- Is there a person, a place, or a thing this is "about"?
- Any concrete fact a visitor must be able to find (address, hours, a date)?
- Anything you want to leave out on purpose? (Often emotionally weighted.)

## Site defaults

- **Mood default:** minimal / editorial. Lean spare.
- **card1 verb register:** quiet. (zh-TW illustrative: "上線" beats "開站"; "建好" beats "完成". In the user's language, pick the natural verb at the same restrained register; don't translate.)
- **Avoid:** marketing voice, growth-language, "join the journey" framing.

## Editor first-prompt template (becomes card3 body)

```text
打開後台，列出目前的 collections。再幫我把首頁 "{{BRAND}}" 的內容草稿補上：一句話的開場 + 三個你看到 mantle/site.md 裡的關鍵點。先不要發佈，等我看過。
```

(EN equivalent, illustrative — render natively in the user's language:)
```text
Open the admin and list the current collections. Then draft the home for "{{BRAND}}": one opening sentence + three points drawn from mantle/site.md. Leave it as a draft so I can read it before publishing.
```

## Schema/View/Procedure extensions

None. `presence` uses the `publication` starter as-is. Customization belongs in [`skills/customize-design/SKILL.md`](../../customize-design/SKILL.md) after deploy.

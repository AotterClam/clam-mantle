---
archetype: intake
status: extension
starter_repo: AotterClam/clam-cms-starters
starter_path: publication
overlays: ["intake"]
applies_to: clam-cms@v0.1.0
---

# `intake` archetype

Follow [the install SKILL](../SKILL.md). The Mantle voice rules from that SKILL apply only when writing the welcome letter — the register hints below feed into `card1` and `card3` of that letter.

## What this is

A public site that **takes structured input** from visitors — leads, signups, applications, requests-for-quote — beyond the basic contact form. Backed by `publication` + an `intake` overlay that adds a Form Schema, a `leads` View for staff, and a Procedure that handles submission with lifecycle hooks.

## Interview probes to emphasize

- **What's the one decision** the form helps the user make about each lead? (Reply / qualify / route — informs the Schema fields.)
- Are submitters anonymous, or do they self-identify by email? (Almost always email; confirm.)
- Will the same person see all leads, or will there be assignment later? (Assignment is `leads-inbox` territory; flag if it comes up.)
- Any one piece of info that disqualifies a lead instantly? (Captured as a Procedure validation, not a UI field.)

## Site defaults

- **Mood default:** clear / functional. Light on flourish — users come to ask for something.
- **card1 verb register:** open-for-business. (zh-TW illustrative: "開始收件", "可以開始接洽"; pick the natural verb that says "ready to receive submissions".)
- **Avoid:** anything that hides what happens to the lead after submission. Form transparency is part of trust.

## Editor first-prompt template (becomes card3 body)

```text
打開後台，看一下 leads collection — 應該是空的。然後幫我把 "{{BRAND}}" 首頁的開場改一下：一句話講這個 form 是收什麼的、幾天內會回覆。語氣參考 mantle/site.md。draft，等我看過。
```

(EN illustrative:)
```text
Open the admin and look at the leads collection (should be empty). Then update the home opener for "{{BRAND}}": one sentence on what the form is for and the response window. Match the voice in mantle/site.md. Draft for my review.
```

## Schema/View/Procedure extensions (overlay)

The `intake` overlay adds (inside the user's repo):

- **Schema `leads`** — the form's fields. Lifecycle `simple` (v0.1.0); editorial is v0.1.x.
- **View `leads-recent`** — staff-only View, requires `mcp:staff`.
- **Procedure `submit-lead`** — `handler.kind: builtin`, `op: create`, `schema: leads`. CAPTCHA `before_create`; Slack-notify `after_create` (default `errorPolicy: continue`).
- **Trigger** — `source.kind: http`, `path: /api/submit-lead`, gated to anonymous.

If the user wants assignment / status (new → qualified → contacted → won/lost), they're asking for `leads-inbox`, which is **roadmap**. Acknowledge, deliver `intake` as a holding pattern, mark the future in `mantle/site.md` `futures:`.

## See also

- [`extend`](../../extend/SKILL.md) — adding additional Schemas / Views / Procedures / Triggers after install.

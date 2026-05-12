---
archetype: membership
status: roadmap
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
applies_to: mantle@v0.1.0
---

# `membership` archetype — ROADMAP

Follow [Mantle persona](../SKILL.md). This file refuses softly and redirects.

## What this would be

Creator / membership content: public posts plus member-only posts, free and paid tiers, Stripe-backed entitlement, creator updates. Requires end-user authentication **and** entitlement gating at the runtime layer. Lands in v0.2.

## Refuse path (Mantle's voice)

Speak in the user's language. Don't translate. Stay quiet and direct.

Bring up these three points, in your own phrasing:

1. **Two blockers, not one.** v0.1 is missing end-user auth AND row-level visibility grammar. Either alone is non-trivial; together they're the v0.2 milestone. Pretending half is fine — public posts now, paid later — produces a site whose access model the user can't actually rely on.
2. **One holding path, name it.** `publication` with everything public, plus a clearly-labeled "member-only is coming" note where paid content would go. Right when the user is building audience first and monetizing later (most paths).
3. **What you'll capture now.** Write into `mantle/site.md` `futures:` — tier shape, expected member count, whether Stripe is already set up, what the first paid post would have been.

## Example phrasing (illustrative; render natively)

zh-TW:
> 這個我先擱著。v0.1 同時缺兩塊：外部會員的登入、跟付費 / 免費的可見度判斷。半套上會讓你跟讀者都不確定誰看得到什麼，這比延後上線更糟。短期建議走 publication，先把公開內容跟讀者群建起來，等 v0.2 補上會員那層再開付費。要這樣走嗎？

EN:
> I'll set this aside. v0.1 is missing two pieces — outside-member sign-in and row-level paid/free visibility. Shipping half makes the access model untrustworthy on both sides, which is worse than waiting. The holding pattern is `publication` with everything public — build the audience first; turn on paid tiers when v0.2 lands the auth and entitlement layer. Sound right?

## Site defaults if user picks the holding path

Switch to the [`publication` archetype](publication.md). In `mantle/site.md` `futures:`, capture the eventual tier shape so a future Mantle session can wire it cleanly when v0.2 ships.

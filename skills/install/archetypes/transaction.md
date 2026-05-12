---
archetype: transaction
status: roadmap
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
applies_to: mantle@v0.1.0
---

# `transaction` archetype — ROADMAP

Follow [Mantle persona](../SKILL.md). This file refuses softly and redirects.

## What this would be

A small-scale shop: a few products, a cart or order intent, fulfillment notes, optionally Stripe Checkout for payment. Tracks toward v0.2's `micro-shop` family (~100 orders/day on pure D1).

## Refuse path (Mantle's voice)

Speak in the user's language. Do not translate. Stay quiet and direct — this is not bad news, just a constraint.

Bring up these three points, in your own phrasing:

1. **Honest "not yet."** v0.1 doesn't carry the order / variant / payment-intent shape needed to do this well. Wiring it as a contact-form variant would be a worse experience for both the buyer and you.
2. **Two holding paths, name both.**
   - `publication` + a simple inquiry form (`intake`-style overlay): visitors describe what they want, you reply by email. Right when volume is low and you're still validating which products work.
   - Wait for v0.2 `micro-shop`. Right when payment-on-page is non-negotiable.
3. **What you'll capture now.** Write the intent into `mantle/site.md` `futures:` so a later Mantle session can pick it up cleanly.

Keep it short. Don't apologize-perform. Move to the chosen holding path immediately.

## Example phrasing (illustrative; render natively)

zh-TW:
> 這個我先放在 futures 裡。v0.1 的 schema 還沒有 order / variant 那一塊，硬塞會變成兩邊都難用。短期內有兩條路：一條是先用 publication + 一個簡單的詢問 form，等你確認哪幾樣商品真的會賣再說；另一條是等 v0.2 的 micro-shop。你想走哪一條？

EN:
> I'll put this in futures. v0.1 doesn't carry the order/variant shape, and forcing it onto a contact form would feel wrong on both sides. Two short paths: `publication` plus a simple inquiry form while you're still figuring out which products move; or wait for `micro-shop` in v0.2. Which one fits?

## Site defaults if user picks the holding path

If the user picks the `publication` + inquiry-form route, switch to the [`intake` archetype](intake.md). Carry over the noticed details from the conversation — don't restart the interview.

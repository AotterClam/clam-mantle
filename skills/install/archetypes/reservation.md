---
archetype: reservation
status: roadmap
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
applies_to: mantle@v0.1.0
---

# `reservation` archetype — ROADMAP

Follow [the install SKILL](../SKILL.md). Refuse uses your normal agent register — Mantle's voice is reserved for the welcome letter and doesn't apply here. The phrasing below is illustrative.

## What this would be

Bookings: services / appointment types, availability windows, reservation requests, reminders, cancellation/reschedule, staff/resource assignment. Tracks toward v0.2's `booking` family.

## Refuse path

Speak in the user's language. Don't translate. Stay quiet and direct.

Bring up these three points, in your own phrasing:

1. **Honest "not yet."** v0.1 doesn't carry the slot / availability / reminder loop that booking needs. Forcing it into a request form drops the most important thing about a booking — the confirmed time.
2. **Two holding paths, name both.**
   - `intake` (a structured request form). The visitor describes what and when; you confirm or reschedule manually. Right when volume is low and you can reply by email or message.
   - Wait for v0.2 `booking`. Right when the user explicitly needs live availability shown to the visitor.
3. **What you'll capture now.** Write the intent into `mantle/site.md` `futures:` — what's being booked, who books it, the asked-for cadence.

## Example phrasing (illustrative; render natively)

zh-TW:
> 預約這塊我先擱著。v0.1 還沒有時段 / 提醒那層，硬做 form 反而會少了「確認時間」這件最重要的事。短期可以用 intake 的方式做預約申請，你手動回確認，等量起來再上 v0.2 booking。要試 intake 嗎？

EN:
> I'll set booking aside for now. v0.1 doesn't carry the slot or reminder layer, and a form alone loses the thing that matters most — a confirmed time. As a holding pattern we can use `intake` for booking requests with manual confirmation, then move to v0.2 `booking` once volume picks up. Want to try `intake`?

## Site defaults if user picks the holding path

Switch to the [`intake` archetype](intake.md). Keep the conversation continuous.

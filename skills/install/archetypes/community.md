---
archetype: community
status: roadmap
starter_repo: aotter/mantle-starters
starter_path: publication
overlays: []
applies_to: mantle@v0.1.0
---

# `community` archetype — ROADMAP

Follow [the install SKILL](../SKILL.md). Refuse uses your normal agent register — Mantle's voice is reserved for the welcome letter and doesn't apply here. The phrasing below is illustrative.

## What this would be

Member-authored content: posts, comments, likes, reactions, moderation queue, public profiles. Requires **end-user authentication** (members are people other than the site owner). Lands in v0.2 once user auth is supported.

## Refuse path

Speak in the user's language. Don't translate. Stay quiet and direct.

Bring up these three points, in your own phrasing:

1. **The blocker is end-user auth, not the schemas.** v0.1's auth model is "one bootstrap owner + their staff agents." Letting outside members sign in and write content is the v0.2 milestone — Better Auth wiring at the runtime level, plus row-level visibility grammar.
2. **One holding path, name it.** `publication` with the owner authoring on the visitors' behalf — comment-style reactions are not available, but member-style posts can be quoted, attributed, and curated by the owner. Right when the user wants the *feel* of a community without member-side write access yet.
3. **What you'll capture now.** Write into `mantle/site.md` `futures:` — what kind of community (forum / fan / interest), expected member count, whether moderation is solo or distributed.

## Example phrasing (illustrative; render natively)

zh-TW:
> 我先把這個放 futures 裡。v0.1 的登入只有「站長 + 他指定的 staff」這一層，要讓外部會員自己寫東西需要等 v0.2 的 end-user auth。短期可以用 publication，由你來幫成員整理和轉述他們的內容，等 v0.2 再開放他們自己貼。要不要先這樣？

EN:
> I'll keep this in futures. v0.1's sign-in is "site owner + their staff" — letting outside members write content needs v0.2's end-user auth. As a holding pattern we can run `publication` and you curate or quote members yourself until v0.2 opens member writes. Want to start there?

## Site defaults if user picks the holding path

Switch to the [`publication` archetype](publication.md). The framing in card1 should reflect that the user is curating, not hosting members directly.

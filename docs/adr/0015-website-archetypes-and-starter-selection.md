# ADR-0015: Website archetypes as the official-site starter selector

## Status

Accepted (new)

## Date

2026-05-10

## Context

mantle is entered through an official site, not through a developer
reading a template catalog. The first screen must ask a non-coder what
kind of site they want to build, then generate a localized starting
prompt that a coding agent can act on.

The early taxonomy mixed several levels:

- concrete starter locations (`aotter/mantle-starters`,
  `starters/blank`)
- planned vertical starters (`leads-inbox`, `micro-shop`,
  `fan-club`)
- broad website intents (company site, blog, booking site, community)

That creates two failure modes:

1. **Starter sprawl.** Every slightly different user goal becomes a new
   starter directory, even when the existing starter plus a small custom
   route / schema / view would be cheaper and clearer.
2. **Wrong product question.** A non-coder does not know whether they
   need `publication` or `leads-inbox`. They know they want "a company
   site", "a place to take bookings", or "member-only paid content".

Website taxonomy is also not single-label. A real site may combine a
brand presence page, articles, a lead form, paid content, and event
RSVPs. The selector therefore cannot pretend that each choice maps 1:1
to a starter repository. It should identify the dominant website
archetype, then let the install Skill and coding agent choose the
closest starter and fill small gaps inside the consumer project.

## Decision

The official site selector uses **website archetypes** as the product
language. Starter packages are implementation presets, not the public
taxonomy.

The accepted top-level archetypes are:

| Official-site wording | Archetype key | Meaning |
|---|---|---|
| Build a company / personal site | `presence` | Brand, company, portfolio, one-page landing, service description. |
| Publish articles / docs / updates | `publication` | Blog, media, docs-lite, changelog, newsletter archive, SEO/AEO content hub. |
| Capture leads / applications / RSVPs | `intake` | Contact forms, inquiries, applications, support requests, RSVPs, quote requests, lead pipeline. |
| Sell products / digital goods | `transaction` | Micro-shop, digital goods, preorder, donation, checkout, order handling, fulfillment. |
| Take bookings / reservations | `reservation` | Appointment booking, event seats, consultation slots, class signup, waitlist, reminders. |
| Run a community | `community` | Member posts, comments, likes, profiles, moderation, user-generated content. |
| Offer member-only / paid content | `membership` | Fan club, paid newsletter, private posts, client portal, tiered access, entitlements. |

`blank` remains a headless/custom substrate. It is not a website
archetype and should not appear beside the archetypes as "one more kind
of website." The agent may choose `blank` when the user's requested
workflow is far outside an available starter shape.

## Mapping to starters

The selector returns an archetype key. The install Skill maps that key
to the best current implementation path.

Initial mapping:

| Archetype | v0.1 implementation path |
|---|---|
| `presence` | `aotter/mantle-starters` with landing/page-heavy prompt. |
| `publication` | `aotter/mantle-starters` with article/docs-heavy prompt. |
| `intake` | `aotter/mantle-starters` extension for basic forms; future dedicated intake starter when qualification/assignment/workflow becomes central. |
| `transaction` | Planned v0.1 vertical proof as a consumer-project extension; future dedicated commerce/transaction starter once order/payment primitives stabilize. |
| `reservation` | v0.2+; offer `publication` + intake fallback for simple RSVP only. |
| `community` | v0.2+; requires end-user auth and moderation workflow. |
| `membership` | v0.2+; requires end-user auth, entitlement mirror, and paid/private access rules. |

This mapping is allowed to change without changing the official-site
wording. For example, `transaction` may start as a publication
extension, then later move to `starters/transaction` without changing
the user's prompt language.

## Agent behavior

The coding agent should treat an archetype as product intent, not as a
hard template name.

- If the requested site is close to an available starter, keep that
  starter and add small consumer-project schemas, views, procedures, or
  custom routes.
- If the request is outside the starter's shape, switch to a better
  starter or `blank` and interview for the missing 4-atom design.
- Do not create a new starter directory just because one user needs one
  extra public page, widget, form, or route.
- Do not mutate `publication` into a shop, community, or membership
  system silently. Escalate when the dominant archetype changes.

The official-site prompt should include both the human wording and the
structured key, e.g.

```yaml
mantle_request:
  archetype: "intake"
  starter: "publication"
  # starter is the current implementation path; archetype is the user's
  # product intent.
```

## Consequences

- Official-site copy becomes stable even while starter packages evolve.
- `publication` can carry both `presence` and `publication` archetypes
  without pretending that every landing-page variant is a separate
  starter.
- `intake`, `transaction`, and simple RSVP can be validated as
  publication extensions before becoming dedicated starter packages.
- `community` and `membership` stay clearly blocked on end-user auth,
  moderation, and entitlement primitives rather than being hidden under
  "blog with comments" or "publication with private posts."
- Skills must perform fit/gap analysis using the archetype key and the
  available starter mapping.
- Documentation should distinguish three terms:
  - **Archetype**: user-facing website intent.
  - **Starter**: implementation preset copied into a consumer project.
  - **Consumer extension**: custom code/manifests/routes added by the
    coding agent inside that project.

## Alternatives

- **Keep six starter families as the public selector.** Rejected. Names
  like `leads-inbox`, `micro-shop`, and `fan-club` are useful
  implementation/preset names, but they are too narrow as the product
  taxonomy.
- **Expose every concrete starter directory.** Rejected. It leaks repo
  structure into the onboarding UX and encourages starter sprawl.
- **One universal starter.** Rejected, consistent with ADR-0013. It
  makes bootstrap-time agent behavior ambiguous and forces one template
  to carry incompatible workflows.
- **Add `learning` and `directory` as top-level archetypes now.**
  Deferred. They are real website families, but early mantle should
  avoid over-promising. `learning` can be revisited when course,
  progress, quiz, and cohort primitives become concrete. `directory`
  can start as `publication` plus custom search/listing routes.

## How to apply

- The official site selector should render the seven human choices in
  this ADR.
- Starting prompts should include `archetype` and may include `starter`
  as the current implementation choice.
- `skills/install/SKILL.md` should map archetype to current starter path
  and explain fallback behavior.
- `docs/prompts/` should be organized by archetype-facing prompt copy,
  even when multiple archetypes map to the same starter.
- Issues for future starters should use archetype language first, then
  describe the implementation preset.

## Implementation status

- `aotter/mantle-starters` currently supports the `presence` and
  `publication` archetypes directly.
- Basic contact capture inside `publication` covers the lightest
  `intake` cases.
- Dedicated `transaction`, `reservation`, `community`, and `membership`
  implementation paths remain roadmap work.
- Issue #76 tracks provider-backed entitlement validation for the
  `membership` archetype.

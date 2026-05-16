---
name: clam-mantle install
description: Install a clam-mantle consumer project. This Skill is interview-driven — it elicits the user's purpose, audience, timing, and identity, scaffolds the project via create-clam-mantle, then delegates the Mantle welcome letter to a background subagent. Use when the user pasted a composed-skill URL from the landing page at https://mantle.aotterclam.ai/skill/install?type=<archetype>&theme=<theme>, or when starting from an empty repo.
when_to_invoke: |
  Empty repo + landing-page composed-skill prompt; or the user describes a site they want to build. The composed URL already inlined the per-archetype hint with this brief.
---

# clam-mantle install

You're installing a clam-mantle site for the user. The composed URL inlined this brief plus the per-archetype hint — archetype-specific register cues are in the same document.

## Ground truth

`@aotterclam/clam-mantle-*` exposes **exactly four declarative atoms** scoped to `cms.clam.ai/v1`, mapping 1-to-1 to Postgres primitives:

| Atom | Postgres analog | External surface |
|---|---|---|
| **Schema** | `CREATE TABLE` | none (manipulated via View / Procedure) |
| **View** | `CREATE VIEW` | auto-mounted at `GET /api/views/<name>` |
| **Procedure** | `CREATE FUNCTION` | none directly; needs a Trigger to bind it |
| **Trigger** | `CREATE TRIGGER` + cron + REST route + LISTEN/NOTIFY | binding atom — turns Procedures into HTTP / lifecycle / MCP surfaces |

Anything domain-shaped (Form, Membership, Workflow) is **composed in the consumer project** from these four plus user TypeScript. Full grammar reference: <https://raw.githubusercontent.com/AotterClam/clam-mantle/develop/docs/design-atoms.md>.

After `create-clam-mantle` runs, the scaffold's ground truth lives in:

| Path | Contents |
|---|---|
| `manifests/*.yaml` | Schemas / Views / Procedures / Triggers this archetype ships |
| `src/clamConfig.ts` | Site defaults, handler-ref registration, runtime bindings |
| `src/handlers/` | Handler implementations (referenced from Procedures with `handler.kind: ref`) |
| `mantle/site.md` | Site semantic layer — brand / voice / locales / futures / revisions |
| `AGENTS.md` | Cross-tool agent entry; updates on every Mantle pass |

Live introspection (run from project root):

```bash
pnpm introspect       # current manifest dump (atoms inventory)
pnpm emit-openapi     # generated HTTP surface
pnpm emit-types       # generated TS types
pnpm validate         # grammar + cross-ref check; structured JSON diagnostics
```

Diagnostics are structured JSON with `code` + `suggestion` fields — surface both verbatim, don't paraphrase.

## Preflight — before the interview

Verify the environment can run the flow. Don't waste the user's time interviewing for a site we can't build:

```bash
node --version    # need ≥ 22 (starter `engines.node`)
pnpm --version    # need ≥ 9
git --version     # any recent
```

If any is missing or below the minimum, surface install hints once and stop until the user confirms tools are ready:
- node ≥ 22: nvm (`nvm install 22 && nvm use 22`), Homebrew, or the official installer at nodejs.org
- pnpm ≥ 9: `corepack enable && corepack prepare pnpm@latest --activate`, or `npm install -g pnpm@9`
- git: system package manager (Homebrew on macOS, apt on Debian/Ubuntu, winget on Windows)

Also confirm the current working directory is empty (or contains only files the user already accepted as part of the install). `create-clam-mantle` writes into this directory directly; collisions with pre-existing files are surprising and rarely what the user wanted.

Don't proceed to the interview until preflight passes.

## The interview

There's no fixed question list. The archetype hint above (composed in by landing) carries **Interview probes to emphasize** — 4 archetype-tailored questions written for this specific archetype's concerns. That's your spine. Free-form follow-ups based on what surfaces. You decide order. You decide when you have enough.

### Goal — what you must land before dispatch

Listed in discovery order — purpose comes first, brand near the end. **Do not read this table as a top-down checklist to ask in order.** The order below mirrors how the interview should flow:

| Value | For |
|---|---|
| **purpose / audience / emotional weight** | Mantle subagent — surfaces through the archetype probes; feeds the welcome letter |
| **audience scope + locales** | `--locales` (count + first is canonical) |
| **description** | `--description` — one-line site identity, agent-drafted in user's language |
| **summary** | `--summary` — one-line install-moment marker, agent-drafted in user's language |
| **brand** | `--brand` — proposed by you after purpose + audience texture is in; user picks or supplies their own |
| **github identity** | `--github-owner` — pure config; ask near the end |

archetype is already known (the composed URL pinned it). Every value above must be set with the user's **explicit confirmation** before you dispatch — never guess from email / folder name / archetype name.

### Multi-round purpose discovery — start here, not with brand

Open with **what's this site for** — not the brand name. Don't ask cold ("describe your site in your own words"); that puts the user on the spot. Use the archetype hint's **Interview probes** (composed in below) as your discovery spine. Ask the first probe naturally, in the user's language, as an open question — don't fabricate multiple-choice options if the probe is written as open-ended. The picker step already happened at the landing page (`?type=` and `?theme=` in the URL); the probes here are about texture, not branching.

User answers → react → ask the next probe. **One probe per turn, not all four at once.** This is the multi-round shape. After 2–4 turns you have enough texture to propose brand candidates (Brand stance below) and synthesize description + summary drafts.

If a probe is phrased with options in the archetype hint, you may offer them as a picker — but most presence / publication / intake probes are intentionally open. Translate every probe (and your framing) into the user's language before presenting.

### Stances (the few non-archetype rules)

**Audience + locales — ask, don't infer.**

Audience scope drives the locale choice and feeds Mantle. Ask the user explicitly who this site is for — is it a domestic audience (and if so, which country / region), or an international audience? Don't infer audience from the user's own writing language alone; a user writing to you in one language may be building for readers in another.

- Domestic audience → propose monolingual in the audience's primary language. Confirm.
- International audience → propose bilingual, canonical = the user's working language, secondary = the audience's language. Confirm.
- Ambiguous (mixed signals, user not sure) → ask once: monolingual `<primary>` or bilingual `<primary>+<secondary>`?
- Use BCP 47 language + optional 2-letter region. The runtime canonicalizer rejects script subtags — write `zh-TW` not `zh-Hant`, and bare-language or `<lang>-<2-letter-region>` for everything else.

**Description + summary — different roles, both agent-synthesized in the user's language.**

These are CLI flags, not separate interview questions. They land in different places and serve different purposes:

| Field | Lands in | Role |
|---|---|---|
| `description` | `mantle/site.md` frontmatter → `siteDefaults.description` → SEO `<meta description>` on every page | **Site brochure** — what the site *is* (perpetual). |
| `summary` | `mantle/site.md` `revisions[0].summary` | **Changelog entry** — what *this install moment* did. Provision / extend / customize-design append their own later. |

Don't write the same one-liner twice. `description` is a one-sentence site identity. `summary` is a one-line install-moment marker — terse, factual, often as short as "Initial scaffold." or "Site created from publication archetype." The site's actual identity already lives in `description`; `summary` is the timestamp's caption, not a second pitch.

Show both drafts when you synthesize; user confirms or corrects.

**Brand — propose last, never first.** Only after purpose + audience + voice texture has surfaced through the archetype probes. Then offer two paths: "Tell me a name, or I can propose 2-3 based on what you've described." If user picks the second, propose 2-3 with a one-line rationale each tied to what they actually said. Don't make the user invent a name cold; and don't propose a name before you have material to anchor the proposal in.

**GitHub identity — factual, last.** Ask once near the end. Pure config; no elaboration needed.

**Other observations — capture without pushing.** Emotional weight, dates that matter, things-not-to-touch, futures — let them surface naturally during the archetype probes. Don't checklist them. Mantle uses whatever you noticed; she doesn't need everything.

### Synthesize and confirm

Before running `create-clam-mantle`, rehearse the install back to the user in their language. Translate technical tokens to something a non-engineer reads naturally — BCP 47 codes become the language's natural name in the user's language, config keys like `github_owner` become their everyday phrasing, archetype codenames become the site type's everyday meaning rather than the codeword.

Surface `description` and `summary` as separate one-line drafts for the user to nod or tweak, since they land in different places (SEO meta vs. revisions log).

## If the archetype is roadmap

If the archetype hint says `status: roadmap`, follow its **Refuse path** — the hint specifies the framing (honest "not yet" → two holding paths → write intent into `mantle/site.md` `futures:`). Move to the holding path the user picks. Skip the rest of the interview steps below.

## When to act

### Why `npx create-clam-mantle` is a destructive action under Auto Mode

Invoking `npx create-clam-mantle` is **not low-risk work**. The command writes the user's site identity — brand, audience, locale, description — into `mantle/site.md` and `src/clamConfig.ts` `siteDefaults`, then runs `git init` and `pnpm install`. Those values drive, perpetually:

- every page's SEO `<meta description>`
- locale routing for the entire site (canonical + redirects)
- Mantle's welcome-card surface in `## welcome`
- 22 starter files' `{{PLACEHOLDER}}` substitution
- `revisions[0]` — the permanent install-moment entry in the changelog

Wrong values ship into the user's first-load impression and cannot be cleanly walked back without wiping the scaffold and re-scaffolding from empty.

**Auto Mode's contract has four clauses. Clauses 1–3 say "execute immediately / minimize interruptions / prefer action". Clause 4 is the carve-out: do not take overly destructive actions without authorization.** This Skill classifies the `npx` invocation under clause 4. Each marker (`<<...>>`) in the composed `## Run this` block (see end of this document) must be a value the user has personally seen and nodded on. Auto-derivation — from the user's email, the current working directory's name, the archetype query, the theme query, or "the locale of the message the user wrote to me" — is **not** authorization. That kind of inference is what Auto Mode's clauses 1–3 want for low-risk work. This Skill specifically does not accept it for these marker values.

If you have not had a turn where the user looked at the exact value and replied affirmatively (or supplied a replacement), the value is unauthorized.

### Prerequisites — each parameter must be user-authorized before invocation

Same discovery order as the Goal table above — purpose first, brand later. The order matters because it reflects the interview shape, not arbitrary alphabetization.

| Value | Marker | Authorized when |
|---|---|---|
| **purpose / audience / emotional weight** | (feeds Mantle, not a CLI flag) | enough texture for Mantle's letter — surfaced through the archetype probes (open-question discovery), not inferred |
| **audience scope** | (drives `<<LOCALES>>`) | user explicitly stated: domestic (which country / region) OR international (which language[s]) |
| **locales** | `<<LOCALES>>` | derived from audience scope; user nodded on the resulting BCP 47 list |
| **description** | `<<DESCRIPTION>>` | agent-drafted in user's language; user nodded on the exact one-liner |
| **summary** | `<<SUMMARY>>` | agent-drafted in user's language; user nodded on the exact one-liner |
| **brand** | `<<BRAND>>` | you proposed 2–3 candidates (Brand stance, after purpose + audience texture is in); user picked one or supplied their own |
| **project-name** | `<<PROJECT_NAME>>` | lowercase-hyphenated slug of brand; show the slug to user in the rehearsal (step 1) and confirm; user can override if they prefer a different repo / dir name |
| **github owner** | `<<GITHUB_OWNER>>` | user explicitly stated their GitHub login (not derived from email) |

If any value is unauthorized — including auto-derivation that "looks reasonable" — the work is still in the interview. Return there. Step 1 below IS the rehearsal back to the user in their language; it is not the moment you collect authorization for unfilled values.

1. **Confirm the synthesized draft.** User accepts or corrects.

2. **Run the composed `## Run this` block.** Scroll to the `## Run this` section at the bottom of this composed document — the landing composer baked the archetype and theme literals into the command. Copy it verbatim, fill the 6 `<<...>>` markers from your authorized interview values (see Prerequisites table above), and run it.

   Do not modify the literal flags or the archetype positional. Do not invent additional flags. If a marker has no authorized value, you're still in the interview — return there.

   The CLI fetches `sources.json` at runtime from `clam-mantle-starters/main`, downloads the starters tarball, merges `_common/` + `<archetype>/` + (optional) `themes/<theme>/`, fills `{{PLACEHOLDER}}` macros, renames `.template` files, runs `git init` and `pnpm install`. RUN_NOTES JSON arrives on stdout.

3. **Read the RUN_NOTES.** The `files_written` list is your scaffold inventory. Walk the ground-truth files — at minimum `manifests/`, `src/clamConfig.ts`, `mantle/site.md` — before deciding anything else.

4. **Adjustment window** (optional, see § below). Only if the interview surfaced a concrete deletion or single-field gap. Always `pnpm validate` after edit; commit before the Mantle subagent runs.

5. **Validate locally:**

   ```bash
   pnpm validate
   pnpm typecheck
   ```

   `pnpm validate` emits `MANTLE_LETTER_NOT_WRITTEN` at this point — expected, no letter yet. The diagnostic clears once the Mantle subagent finishes (step 9). Anything else non-zero → surface `code` + `suggestion` verbatim.

6. **Pre-provision dialogue — preview + voice elicitation (this is a chatter zone, not a checklist).**

   Before writing `mantle/site.md` prose or dispatching the Mantle subagent, open a small conversation with the user. The goals are (a) let them peek at what just got built, (b) **draw voice material out of them by writing something concrete together** rather than asking abstract "what's your register" questions.

   Read RUN_NOTES `files_written` to see which collections the archetype actually ships. The drafting medium depends on what's there:

   - **Archetypes with a post-like collection** (`publication`, `community`, `membership`): offer to draft 1–2 sample posts/entries. Propose 2–4 topics anchored in what the interview surfaced (training log, a parenting moment, a brand-voice opener, etc.). Let the user pick, add, kill. Drafts get saved to `mantle/drafts/<slug>.md`; admin can pick them up later.
   - **Archetypes without posts** (`presence`, `intake`, `transaction`, `reservation`, `blank`): no `posts` collection exists — **do not fabricate one**. Instead, offer to draft one short concrete piece of copy the archetype actually needs: the home-page opening sentence, the intake form intro, the reservation page tagline. One paragraph max. Save into `mantle/drafts/home-opener.md` (or similar archetype-fitting name) only if the user wants it kept.
   - **Roadmap archetypes**: skip this step entirely. The refuse path already routed the conversation.

   For any drafting that happens, the dynamic is the same: show the user, let them react, capture the reactions. Each correction / line cut / tone push / pronoun-choice complaint is gold for voice elicitation.

   For cover images (post-shaped drafts only): use LoremFlickr (`source.unsplash.com` was deprecated in 2023; LoremFlickr is the closest keyword-based replacement). Pick 1–3 comma-separated keywords from the draft content. URL pattern: `https://loremflickr.com/<width>/<height>/<keyword1>,<keyword2>`. **Verify each URL resolves with a GET request before embedding — expect a 302 redirect to a cached JPG (`curl -sL -o /dev/null -w "%{http_code} %{content_type}"`), and confirm final status is 200 and content-type starts with `image/`.** Don't use `HEAD` — LoremFlickr's resized-cache path responds to GET only. If verification fails, leave the cover slot empty and tell the user.

   This step's length is responsive to the user. Curt user / no-deadline / "just go" → keep it to one offer and skip on a no. Engaged user → spend 5–10 minutes drafting together. The investment here pays off in the next step.

7. **Write the non-letter `mantle/site.md` sections + the editor `first_prompt:` body in your normal register.**

   You fill these — Mantle (the subagent in step 9) only owns the welcome letter cards. Use what came out of the interview + step 6's drafting dialogue. **Reflect what the user said and how they reacted.** Imagination is fine where the user left blank space; don't fabricate vocabulary they pushed back on or never used.

   - `## site` — one paragraph reflecting why this site exists.
   - `## voice` — a few lines of register markers, with priority on phrases the user actually used / words they killed during drafting / titles they liked vs hated. If voice didn't surface concretely, write SHORT; honest brevity beats invented detail.
   - `## history` — one paragraph: what was decided, what the user said in their words, what's still open. Note any emotional weight (excited / anxious / curt / grieving). If you drafted posts in step 6, mention the drafts + how user reacted — Mantle reads this as transcript material.
   - `## editor first_prompt:` body — mechanical fill. Copy the archetype hint's `Editor first-prompt template` block, substitute `<<BRAND>>` with the actual brand, paste as plain text under the YAML `first_prompt: |` key (indented properly).

8. **Get the Mantle subagent prompt:**

   ```bash
   pnpm -s mantle:prompt > /tmp/mantle-letter-prompt.md
   ```

   `-s` suppresses pnpm's banner so the file is just the prompt body. The script reads `mantle/site.md` (frontmatter + your `## site` / `## voice` / `## history` sections), fetches the archetype hint from `clam-mantle-starters`, substitutes `<<MANTLE_*>>` placeholders in the scaffolded `mantle-subagent-prompt.md`, prints to stdout. Fails fast if any of the three sections still hold template placeholders.

9. **Dispatch the Mantle subagent (in background)** with `/tmp/mantle-letter-prompt.md` as its only prompt body. Use a `general-purpose` subagent with `run_in_background: true`.

   The subagent writes **three welcome cards** (card1 with Mantle's self-intro + a noticed detail; card4 — when you need me back; card5 — done + closing line) plus the closing handoff line at the end of `## welcome`. Cards 2 (mcp install command) and 3 (editor first prompt) are mechanical — admin UI renders them at display time from `<SITE_URL>`, the brand, and your filled `## editor first_prompt:`. They don't live in `mantle/site.md`.

   **You stay in your normal register throughout.** You never write the welcome letter yourself; Mantle's voice is encapsulated in the subagent prompt template that `pnpm mantle:prompt` filled. This is the whole reason for the delegation — register isolation. Don't peek-and-confirm the cards before they're written; the letter is a small surprise the user discovers in `mantle/site.md`.

   While the subagent works, prepare provision context: `gh auth status`, confirm the GitHub identity from the interview matches.

10. **When the Mantle subagent returns**, run `pnpm validate` again — `MANTLE_LETTER_NOT_WRITTEN` clears. If it still fires, card1 / card4 / card5 weren't all filled; check the subagent's reply for what went wrong, fix or re-dispatch.

11. **Commit.** If step 4 produced an adjustment, that's its own commit. Then the main commit: `mantle: notes from install interview`.

12. **Continue to provision — don't push a URL onto the user.** Provision is the next phase in the same conversation. Replace `install` with `provision` in the composed URL you read at the start, keep the same `?type=` + `?theme=` query, fetch that URL, follow it. Fall back to `https://raw.githubusercontent.com/AotterClam/clam-mantle/develop/skills/provision/SKILL.md` if the landing origin isn't in working context. The user's next involvement is supplying the Cloudflare API token when provision asks — everything before that is your job. Don't promise production-readiness until provision completes and a second agent connects through MCP.

## Adjustment window — between scaffold and provision

A permitted modification turn after `create-clam-mantle` returns and before the Mantle subagent fires. Small concrete edits to match what the user said.

### In scope

| Action | Why |
|---|---|
| Delete a manifest the user explicitly said they don't need | Honesty over inertia |
| Add a single field to an existing Schema, from a concrete interview signal | Small, validated, recoverable |
| Edit `src/clamConfig.ts` site defaults beyond what `create-clam-mantle` set | Site-shape, fits Mantle's surface |
| Tweak `src/theme/` tokens if the user gave a strong visual register | Prefer deferring to the customize-design Skill unless explicit |

### Out of scope

| Action | Route to |
|---|---|
| Add a new Schema (beyond single-field tweak), View, Procedure, or Trigger | The extend skill |
| Substantial theme work (template fork, layout reshape) | The customize-design skill, after deploy |
| Anything touching DRAFT grammar keys | Never at install — grammar locked at v0.1 |

### Discipline

- `pnpm validate` after every edit. Non-clean tree never advances to the Mantle subagent.
- Show the diff before applying. A deleted manifest deserves a one-line confirm.
- Don't speculate. "I think you might also want X" is generation, not interview.

## Don't

- Don't put on Mantle's voice yourself — that's the subagent's job. Register isolation is the whole point of the delegation in step 9.
- Don't write into `src/theme.default/` or any "system-looking" path during install — design changes happen after deploy via the customize-design skill.
- Don't keep speaking after the handoff to provision — the handoff IS the end of this Skill.
- Don't echo the same specific user detail across multiple cards (that's Mantle's rule, but you also shouldn't paste card1's detail back into `## site` — let each section have its own).

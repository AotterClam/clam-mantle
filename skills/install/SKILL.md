---
name: mantle install
description: Install a mantle consumer project. This Skill is interview-driven — it elicits the user's purpose, audience, timing, and identity, scaffolds the project via create-mantle, then delegates the Mantle welcome letter to a background subagent. Use when the user pasted a composed-skill URL from mantle-landing's `/skill/install?type=<archetype>&theme=<theme>` endpoint, or when starting from an empty repo.
when_to_invoke: |
  Empty repo + landing-page composed-skill prompt; or the user describes a site they want to build. The composed URL already inlined the per-archetype hint with this brief.
applies_to: mantle@v0.1.0
---

# mantle install

You're installing a mantle site. **This is an interview-driven Skill** — the interview is the work; the scaffold is what falls out of it. Don't substitute defaults guessed from email, folder name, or archetype name.

The composed URL inlined this brief plus the per-archetype hint — archetype-specific register cues are in the same document.

## Ground truth

`@aotter/mantle-*` exposes **exactly four declarative atoms** scoped to `cms.mantle.aotter.net/v1`, mapping 1-to-1 to Postgres primitives:

| Atom | Postgres analog | External surface |
|---|---|---|
| **Schema** | `CREATE TABLE` | none (manipulated via View / Procedure) |
| **View** | `CREATE VIEW` | auto-mounted at `GET /api/views/<name>` |
| **Procedure** | `CREATE FUNCTION` | none directly; needs a Trigger to bind it |
| **Trigger** | `CREATE TRIGGER` + cron + REST route + LISTEN/NOTIFY | binding atom — turns Procedures into HTTP / lifecycle / MCP surfaces |

Anything domain-shaped (Form, Membership, Workflow) is **composed in the consumer project** from these four plus user TypeScript. Full grammar reference: <https://raw.githubusercontent.com/aotter/mantle/develop/docs/design-atoms.md>.

After `create-mantle` runs, the scaffold's ground truth lives in:

| Path | Contents |
|---|---|
| `manifests/*.yaml` | Schemas / Views / Procedures / Triggers this archetype ships |
| `src/mantleConfig.ts` | Site defaults, handler-ref registration, runtime bindings |
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
node --version    # need ≥ 20
pnpm --version    # need ≥ 9
git --version     # any recent
```

If any is missing or below the minimum, surface install hints once and stop until the user confirms tools are ready:
- node ≥ 20: nvm (`nvm install 20 && nvm use 20`), Homebrew, or the official installer at nodejs.org
- pnpm ≥ 9: `corepack enable && corepack prepare pnpm@latest --activate`, or `npm install -g pnpm@9`
- git: system package manager (Homebrew on macOS, apt on Debian/Ubuntu, winget on Windows)

Also confirm the current working directory is empty (or contains only files the user already accepted as part of the install). `create-mantle` writes into this directory directly; collisions with pre-existing files are surprising and rarely what the user wanted.

Don't proceed to the interview until preflight passes.

## The interview

There's no fixed question list. The archetype hint above (composed in by landing) carries **Interview probes to emphasize** — 4 archetype-tailored questions written for this specific archetype's concerns. That's your spine. Free-form follow-ups based on what surfaces. You decide order. You decide when you have enough.

### Goal — what you must land before dispatch

| Value | For |
|---|---|
| **brand** | `--brand` |
| **locales** | `--locales` (count + first is canonical) |
| **description** | `--description` — agent synthesizes one line from the interview |
| **summary** | `--summary` — agent writes one-line install description |
| **github identity** | `--github-owner` |
| purpose / audience / emotional weight | Mantle subagent — used to write the welcome letter |

archetype is already known (the composed URL pinned it). Every value above must be set with the user's **explicit confirmation** before you dispatch — never guess from email / folder name / archetype name.

### Stances (the few non-archetype rules)

**Brand — propose if blocked.** Once you've heard enough purpose to suggest a name, offer two paths: "Tell me a name, or I can propose 2-3 based on what you've described." If user picks the second, propose 2-3 with a one-line rationale each. Don't make the user invent a name cold — that's the worst opening move.

**Locales — infer the user's preferred language, default to monolingual, confirm.**

Detect the user's preferred language from the signals available — the language they're writing in, the landing-prompt language (rendered for the visitor), any runtime-level locale preference your environment carries. Propose monolingual in that language. Whatever language; no implied menu.

- If the interview surfaces an international / foreign-facing audience (overseas users, foreign customers, multilingual readership), propose **bilingual** with the user's primary language as canonical and the audience's language as secondary.
- Mixed signals with no internationalization cue → ask once: "monolingual `<primary-language>` or bilingual?"
- Always confirm before locking in.
- Use BCP 47 language + optional 2-letter region. The runtime canonicalizer rejects script subtags — write `zh-TW` not `zh-Hant`, and bare-language or `<lang>-<2-letter-region>` for everything else.

**Description + summary — different roles, both agent-synthesized in the user's language.**

These are CLI flags, not separate interview questions. They land in different places and serve different purposes:

| Field | Lands in | Role |
|---|---|---|
| `description` | `mantle/site.md` frontmatter → `siteDefaults.description` → SEO `<meta description>` on every page | **Site brochure** — what the site *is* (perpetual). |
| `summary` | `mantle/site.md` `revisions[0].summary` | **Changelog entry** — what *this install moment* did. Provision / extend / customize-design append their own later. |

Don't write the same one-liner twice. `description` is a one-sentence site identity. `summary` is a one-line install-moment marker — terse, factual, often as short as "首次安裝。" / "Initial scaffold." / "Site created from publication archetype." The site's actual identity already lives in `description`; `summary` is the timestamp's caption, not a second pitch.

Show both drafts when you synthesize; user confirms or corrects.

**GitHub identity — factual, last.** Ask once near the end. Pure config; no elaboration needed.

**Other observations — capture without pushing.** Emotional weight, dates that matter, things-not-to-touch, futures — let them surface naturally during the archetype probes. Don't checklist them. Mantle uses whatever you noticed; she doesn't need everything.

### Synthesize and confirm — conversationally, not as a config table

Before running `create-mantle`: rehearse the install back in the user's language as 2-3 plain sentences. Translate every technical token to something a non-engineer can read:

- `zh-TW` → "繁體中文（台灣）"
- `en` → "英文"
- `github_owner` → "GitHub 帳號"
- `--locales zh-TW,en` → "主要中文，附帶英文版"
- archetype names → use the site type's everyday meaning ("內容發佈站" / "個人介紹站" / "需求收集表"), not the codeword

Example rehearsal: "OK 我整理一下：你要開的是『拎杯有練』，一個用繁體中文、給台灣讀者看的內容發佈站；網站歸到你 guyspy 這個 GitHub 帳號管。對嗎？"

Then surface description + summary drafts as separate sentences for the user to nod / tweak:

- "網站描述（會放在每頁的 SEO 標籤）：『...一行...』"
- "首次安裝的紀錄條目：『首次安裝。』 或想換句別的也行"

The user confirms or tweaks in natural language. Pull dispatch values out of the exchange. **Don't run `create-mantle` until the user has nodded at the rehearsal.** Never dump a `field: value` config table — that's an engineering surface, not a user-facing one.

## If the archetype is roadmap

If the archetype hint says `status: roadmap`, follow its **Refuse path** — the hint specifies the framing (honest "not yet" → two holding paths → write intent into `mantle/site.md` `futures:`). Move to the holding path the user picks. Skip the rest of the interview steps below.

## When to act

1. **Confirm the synthesized draft.** User accepts or corrects.

2. **Run `create-mantle` non-interactively.** Distributed as a tarball attached to a `mantle-starters` GitHub release:

   ```bash
   npx https://github.com/aotter/mantle-starters/releases/download/v0.0.8-alpha/aotter-create-mantle-0.0.8-alpha.1.tgz \
     <archetype> \
     --project-name "<lowercase-hyphenated>" \
     --brand "<brand>" \
     --description "<one line>" \
     --locales "<canonical>,<secondary>" \
     --github-owner "<gh-login>" \
     --summary "<one-line install description>"
   ```

   The package fetches `sources.json` at runtime from `mantle-starters/main`, downloads the starters tarball, merges `_common/` + `<archetype>/` + (optional) `themes/<theme>/`, fills `{{PLACEHOLDER}}` macros, renames `.template` files, runs `git init` and `pnpm install`. RUN_NOTES JSON arrives on stdout.

3. **Read the RUN_NOTES.** The `files_written` list is your scaffold inventory. Walk the ground-truth files — at minimum `manifests/`, `src/mantleConfig.ts`, `mantle/site.md` — before deciding anything else.

4. **Adjustment window** (optional, see § below). Only if the interview surfaced a concrete deletion or single-field gap. Always `pnpm validate` after edit; commit before the Mantle subagent runs.

5. **Validate locally:**

   ```bash
   pnpm validate
   pnpm typecheck
   ```

   `pnpm validate` emits `MANTLE_LETTER_NOT_WRITTEN` at this point — expected, no letter yet. The diagnostic clears once the Mantle subagent finishes (step 9). Anything else non-zero → surface `code` + `suggestion` verbatim.

6. **Pre-provision dialogue — preview + draft together (this is a chatter zone, not a checklist).**

   Before writing `mantle/site.md` prose or dispatching the Mantle subagent, open a small conversation with the user. The goals are (a) let them peek at what just got built, (b) seed a draft post or two together so day-one isn't empty, (c) **draw more voice material out of the user through writing concretely** rather than asking abstract "what's your register" questions.

   A shape that works (adapt freely; don't read this off like a script):

   - Briefly describe what's in the project — "後台空的，posts collection 空的，contact 表單還掛著但 Turnstile 之後 provision 才接". Show the user where you are.
   - Offer: "deploy 之前我可以幫你寫 1–2 篇 draft 放著，你 deploy 後登入就有東西看，順便對一下語氣。要不要？" If no, skip to step 7. If yes, continue.
   - Propose 2–4 post topics anchored in what the interview surfaced (training log, a parenting moment, a brand-voice opener, etc.). Let them pick, add, or kill any. The picking/killing itself reveals priorities.
   - Draft the chosen post(s). Show them. Let the user react — "再狂一點 / 太裝 / 這句砍掉 / 第一人稱不要拘謹". Each reaction is gold for voice elicitation.
   - For cover images: use Unsplash. Pick a keyword from the draft content. **Verify every Unsplash URL resolves (HEAD request → 200 + content-type starting `image/`) before embedding.** Don't fabricate image IDs from training memory; if you can't verify, leave the cover slot empty and tell the user.
   - When the drafts feel like the user's voice, ask if they want to keep them (saved into the scaffold somewhere reasonable — `mantle/drafts/<slug>.md` is a fine place; provision/admin can pick them up later) or just discard them now that they served their voice-elicitation purpose.

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

   `-s` suppresses pnpm's banner so the file is just the prompt body. The script reads `mantle/site.md` (frontmatter + your `## site` / `## voice` / `## history` sections), fetches the archetype hint from `mantle-starters`, substitutes `<<MANTLE_*>>` placeholders in the scaffolded `mantle-subagent-prompt.md`, prints to stdout. Fails fast if any of the three sections still hold template placeholders.

9. **Dispatch the Mantle subagent (in background)** with `/tmp/mantle-letter-prompt.md` as its only prompt body. Use a `general-purpose` subagent with `run_in_background: true`.

   The subagent writes **three welcome cards** (card1 with Mantle's self-intro + a noticed detail; card4 — when you need me back; card5 — done + closing line) plus the closing handoff line at the end of `## welcome`. Cards 2 (mcp install command) and 3 (editor first prompt) are mechanical — admin UI renders them at display time from `<SITE_URL>`, the brand, and your filled `## editor first_prompt:`. They don't live in `mantle/site.md`.

   **You stay in your normal register throughout.** You never write the welcome letter yourself; Mantle's voice is encapsulated in the subagent prompt template that `pnpm mantle:prompt` filled. This is the whole reason for the delegation — register isolation. Don't peek-and-confirm the cards before they're written; the letter is a small surprise the user discovers in `mantle/site.md`.

   While the subagent works, prepare provision context: `gh auth status`, confirm the GitHub identity from the interview matches.

10. **When the Mantle subagent returns**, run `pnpm validate` again — `MANTLE_LETTER_NOT_WRITTEN` clears. If it still fires, card1 / card4 / card5 weren't all filled; check the subagent's reply for what went wrong, fix or re-dispatch.

11. **Commit.** If step 4 produced an adjustment, that's its own commit. Then the main commit: `mantle: notes from install interview`.

12. **Continue to provision — don't push a URL onto the user.** Provision is the next phase in the same conversation. Replace `install` with `provision` in the composed URL you read at the start, keep the same `?type=` + `?theme=` query, fetch that URL, follow it. Fall back to `https://raw.githubusercontent.com/aotter/mantle/develop/skills/provision/SKILL.md` if the landing origin isn't in working context. The user's next involvement is supplying the Cloudflare API token when provision asks — everything before that is your job. Don't promise production-readiness until provision completes and a second agent connects through MCP.

## Adjustment window — between scaffold and provision

A permitted modification turn after `create-mantle` returns and before the Mantle subagent fires. Small concrete edits to match what the user said.

### In scope

| Action | Why |
|---|---|
| Delete a manifest the user explicitly said they don't need | Honesty over inertia |
| Add a single field to an existing Schema, from a concrete interview signal | Small, validated, recoverable |
| Edit `src/mantleConfig.ts` site defaults beyond what `create-mantle` set | Site-shape, fits Mantle's surface |
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

- Don't skip the interview. This Skill exists to elicit context — the structured questions are the work.
- Don't put on Mantle's voice yourself. That's the subagent's job; you stay in your normal register from interview through handoff.
- Don't run `create-mantle` before all six questions are answered and the synthesized draft is confirmed.
- Don't write into `src/theme.default/` or any "system-looking" path during install — design changes happen after deploy via the customize-design skill.
- Don't keep speaking after the handoff to provision.
- Don't echo the same specific user detail across multiple cards (that's Mantle's rule, but you also shouldn't paste card1's detail back into `## site` — let each section have its own).

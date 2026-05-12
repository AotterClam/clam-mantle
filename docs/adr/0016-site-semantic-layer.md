# ADR-0016: Site semantic layer — `AGENTS.md` + `mantle/site.md`

## Status

Accepted (new)

## Date

2026-05-12

## Context

clam-cms consumer projects are agent-authored (ADR-0007). Once the
install Skill finishes, the user's repo is operated by a stream of
agents over time: a daily content agent that picks up where the previous
session left off, a deploy agent that runs `provision`, a customize
agent that tweaks the theme, and so on.

These agents arrive without conversation context. They need a way to
read what this site *is* — its purpose, voice, the user's
already-decided futures, things-not-to-touch, install-time decisions —
and to leave a trace for the next agent.

POC tried two extremes:

1. **No persistence.** Every new session re-interviewed the user. The
   user got frustrated within two return visits; the agent generated
   register that did not match the previous voice.
2. **Per-decision JSON.** Structured fields for `brand`, `voice`,
   `mood`, etc. Worked for machine-readable values, failed for prose
   like "I want this site to feel like a quiet hotel lobby." Agents
   either ignored the prose or rewrote it into a thin label.

Research informing this ADR (citations in Epic #97):

- [Cline Memory Bank](https://docs.cline.bot/features/memory-bank) — multi-file pattern; rejected as too heavy for a single-site repo.
- [AGENTS.md spec](https://agents.md/) — emerging cross-tool convention adopted by Codex, Cursor, Aider, Amp, Factory. Tools look for `AGENTS.md` at repo root.
- [Letta Memory Blocks](https://docs.letta.com/guides/core-concepts/memory/memory-blocks/) — labeled blocks + `description:` purpose headers; atomic replace.
- [Claude Code memory](https://code.claude.com/docs/en/memory) — size budget < 200 lines per file; atomic-replace edit pattern.
- [Cursor Rules](https://cursor.com/docs/context/rules) — frontmatter + body convention.

## Decision

Two files, one canonical per layer, both at known paths:

| File | Audience | Size budget | Format |
|---|---|---|---|
| `AGENTS.md` | Any tool that looks for cross-tool agent entry (Codex / Cursor / Aider / Amp / Factory / Claude Code) | ~30 lines | Plain markdown |
| `mantle/site.md` | Mantle (the clam-cms install / customize / deploy persona — Epic #47) | ~300 lines | Frontmatter + section bodies |

`AGENTS.md` is short and stable: what this project is, what the
commands are, where to look next. It points at `mantle/site.md` for the
deep context.

`mantle/site.md` carries Mantle's semantic layer:

- Frontmatter holds machine-readable values (archetype, locales, URL,
  install timestamp, revision log).
- Body holds prose with `> purpose:` headers per section — Mantle reads
  the whole file on return, edits sections, writes the whole file
  back. Atomic replace, not append.
- `## history` appends one paragraph per Mantle return so the trail is
  recoverable.

Both files ship as pre-printed `{{PLACEHOLDER}}` templates that
`create-clam-cms` fills at install time. Mantle then replaces the HTML
comments in `mantle/site.md` sections with prose drawn from the
install interview. This pattern (Cline `projectbrief.md`) keeps
generation drift low — the structure is fixed; only the slots fill
from interview.

### Placeholder macro list

`create-clam-cms` substitutes these across templates:

| Macro | Source | Example |
|---|---|---|
| `{{ARCHETYPE}}` | install flag | `presence`, `publication`, `intake`, `blank` |
| `{{BRAND}}` | install flag | `Lab Cafe` |
| `{{DESCRIPTION}}` | install flag | `Coffee + research notes from Taipei.` |
| `{{LOCALES}}` | install flag (JSON array string) | `["zh-TW","en"]` |
| `{{CANONICAL_LOCALE}}` | first locale | `zh-TW` |
| `{{SITE_URL}}` | placeholder until provision | `https://example.com` |
| `{{GITHUB_OWNER}}` | install flag | `phsu` |
| `{{INSTALL_TIMESTAMP}}` | ISO 8601 of install run | `2026-05-12T14:03:00Z` |
| `{{INSTALL_SUMMARY}}` | install flag (Mantle's one-line install description) | `bootstrapped publication site for Lab Cafe in zh-TW/en` |

New macros must be documented here and in the templates' `_common/`
versions before `create-clam-cms` learns to substitute them.

### Update workflow

- **Mantle on return**: read `mantle/site.md` whole, edit relevant
  sections, write whole file back, append one paragraph to `## history`.
- **provision on deploy**: rewrite frontmatter `site_url:` from
  placeholder to the real Workers URL; append a `revisions:` entry; one
  commit at end of provision.
- **No mid-section staged-and-running mutation.** Either a section is
  prose-replaced atomically (Mantle) or a frontmatter scalar/list is
  replaced and committed (provision script). No partial writes.

### Cross-tool compatibility

`AGENTS.md` is at repo root because that is where every cross-tool
agent harness looks. `mantle/` is a clam-cms-owned subdirectory; the
naming is deliberately specific so a generic AGENTS.md reader does not
accidentally try to interpret it as its own state.

### Per-archetype overlay convention

Archetypes that need to extend the base templates (e.g., `intake` adds
a Form Schema → `AGENTS.md` `## Commands` should mention
`pnpm export:leads`) ship overlays:

- `clam-cms-starters/<archetype>/overlay/AGENTS.md.append` — content
  appended after the base.
- `clam-cms-starters/<archetype>/overlay/mantle/site.md.append` —
  section-keyed. v0.1: only allow appending to `## history` and adding
  new `## <name>` sections.

Overlay merging is the responsibility of `create-clam-cms`, not
Mantle.

## Consequences

### What this buys

- A returning agent (Mantle or a daily content agent) can recover the
  site's intent without re-interviewing the user.
- The user can paste `mantle/site.md` into any conversation to bring an
  agent up to speed. Until `.well-known/mantle/` ships (Epic #97
  out-of-scope), this is the handoff mechanism.
- `AGENTS.md` participates in the cross-tool ecosystem with zero
  bespoke wiring.
- Atomic replace + revision log means the file is recoverable from
  `git log -p mantle/site.md` if Mantle ever writes wrong prose.

### What this costs

- Two files instead of one. Mitigated by clear role split:
  `AGENTS.md` is "what is this and how do I run it"; `mantle/site.md`
  is "what does this site mean and what has Mantle done".
- Mantle must read the whole `mantle/site.md` before editing. At
  ~300-line budget this is cheap.
- Placeholder substitution adds a step to install. Mitigated by
  collapsing into `create-clam-cms` (ADR-0013 step 3 → 4).

### What this does not do

- It does not replace the manifest (`manifests/*.yaml`). Schemas /
  Views / Procedures / Triggers are the runtime contract; this layer
  is the *intent* layer. Agents that touch manifests still go through
  `skills/extend/SKILL.md`.
- It does not persist across deploys via Worker storage. The repo is
  the source of truth. `.well-known/mantle/` (Epic #97 out-of-scope)
  will later expose `mantle/site.md` over the Worker so a returning
  agent can fetch it without `git clone`.

## Alternatives considered

- **Single canonical file.** Smaller, but conflates "this is how to
  run the project" (cross-tool concern) with "this is what the site
  means" (clam-cms concern). The two layers churn at different rates;
  `mantle/site.md` updates on every Mantle return, `AGENTS.md` updates
  rarely.
- **Cline 6-file Memory Bank.** Right shape for an IDE-level coding
  agent that manages many projects. Too heavy for a single-site
  consumer repo where there is one author and one operating context.
- **JSON-only structured state.** Loses prose. The interview signal
  ("a quiet hotel lobby") is not reducible to enums without
  flattening.
- **YAML-only with prose under keys.** Rejected because the prose
  needs `> purpose:` framing for the agent to know what each block is
  for; YAML's scalar/block-scalar story makes this awkward.

## How to apply

When building anything that mutates `mantle/site.md`:

1. Read the whole file first (`fs.readFileSync`).
2. Parse frontmatter + body separately.
3. Edit the relevant section's body OR the frontmatter scalar.
4. Append a one-paragraph entry to `## history` (Mantle) or a
   `revisions:` entry to frontmatter (provision).
5. Write whole file atomically.
6. Single git commit per logical change.

When introducing a new placeholder macro:

1. Add to the macro table in this ADR.
2. Add to `_common/AGENTS.md.template` or `_common/mantle/site.md.template` as appropriate.
3. Add to `create-clam-cms` substitution pass.
4. Add the install-time source (CLI flag from Mantle interview).

When an archetype needs to extend templates:

1. Place `overlay/AGENTS.md.append` or
   `overlay/mantle/site.md.append` under that archetype's directory in
   `clam-cms-starters`.
2. Append-only. Section-keyed overlays for `mantle/site.md` may only
   target `## history` or add new `## <name>` sections.

## Implementation status

- Templates land in `clam-cms-starters/_common/` (sibling issue #101).
- Substitution is implemented in `packages/create-clam-cms` (#102).
- Install SKILL emits the post-`create-clam-cms` prose fill workflow
  (#103).
- Provision SKILL writes the `revisions:` + `site_url:` update on
  deploy (#105).
- `.well-known/mantle/` Worker route is out of scope for v0.1.0; see
  #49 for the follow-on.

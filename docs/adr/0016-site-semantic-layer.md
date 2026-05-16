# ADR-0016: Site semantic layer — `AGENTS.md` + `mantle/site.md`

## Status

Accepted (slimmed 2026-05-12 per Epic #116; original 2026-05-12).

## Decision

Every agent-authored mantle project carries two files at fixed paths. They serve different audiences, change at different rates, and are filled by `create-mantle` from `_common/*.template` files.

| File | Audience | Size budget | Format |
|---|---|---|---|
| `AGENTS.md` | Any cross-tool agent harness (Codex / Cursor / Aider / Amp / Factory / Claude Code) | ~30 lines | Plain markdown |
| `mantle/site.md` | Mantle (install / customize / deploy persona — Epic #47, scoped per Epic #116) | ~300 lines | Frontmatter + section bodies |

`AGENTS.md` answers "what is this and how do I run it." `mantle/site.md` carries the site's semantic layer:

- Frontmatter: machine-readable (`archetype`, `brand`, `locales`, `site_url`, `revisions[]`, `futures[]`, `dont_touch[]`).
- Body sections (`## site`, `## voice`, `## welcome` (5 cards), `## editor`, `## history`) each open with a `> purpose:` header so agents can route reads without parsing prose. Mantle reads the whole file on return, edits sections, writes the whole file back. **Atomic replace, not append.**

## Placeholder macros

`create-mantle` substitutes these across `_common/*.template` files in a single pass:

| Macro | Source | Example |
|---|---|---|
| `{{ARCHETYPE}}` | CLI flag | `presence` |
| `{{BRAND}}` | CLI flag | `Lab Cafe` |
| `{{DESCRIPTION}}` | CLI flag | `Coffee + research notes from Taipei.` |
| `{{LOCALES}}` | CLI flag (JSON array) | `["zh-TW","en"]` |
| `{{CANONICAL_LOCALE}}` | first locale | `zh-TW` |
| `{{SITE_URL}}` | placeholder until provision | `https://example.com` |
| `{{GITHUB_OWNER}}` | CLI flag | `phsu` |
| `{{INSTALL_TIMESTAMP}}` | ISO 8601 of install run | `2026-05-12T14:03:00Z` |
| `{{INSTALL_SUMMARY}}` | CLI flag | `bootstrapped publication site for Lab Cafe in zh-TW/en` |

New macros must be added here, to `_common/*.template`, and to the substitution pass in `create-mantle`.

## Update rules

- **Mantle on return**: read whole `mantle/site.md`, edit relevant sections, write whole atomically, append one paragraph to `## history`. Voice rules (Epic #116 scope-narrow) apply only when editing the `## welcome` 5 cards and the closing handoff line.
- **provision on deploy**: rewrite frontmatter `site_url:` placeholder → real Workers URL; append a `revisions:` entry. Same `Public site:` rewrite in `AGENTS.md`. Single commit at end of provision.
- **No mid-section staged-and-running mutation.** A section is prose-replaced atomically, or a frontmatter scalar/list is replaced — never partial writes.

## Cross-tool compatibility

`AGENTS.md` lives at repo root because that is where the AGENTS.md ecosystem (`agents.md`) looks. `mantle/` is a mantle-owned subdirectory; the naming is deliberately specific so a generic AGENTS.md reader does not interpret it as its own state.

## Implementation

- Templates: `mantle-starters/_common/AGENTS.md.template` and `mantle-starters/_common/mantle/site.md.template`.
- Substitution: `packages/create-mantle/src/placeholder.ts`.
- Install handoff: `skills/install/SKILL.md` describes the post-substitution prose-fill (HTML comments → prose drawn from interview).
- Provision update: `skills/provision/SKILL.md` describes the `site_url:` + `revisions:` write after deploy.
- Theme overlay merge (Epic #116): `themes/<theme-key>/` overlay applies after the archetype starter and may touch `src/theme/` — never these two files.

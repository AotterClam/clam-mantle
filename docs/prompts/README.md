# Starting prompts

Localized two-URL starting-prompt drafts, one per archetype + locale.

## What these are

The single sentence the user pastes into Claude Code / Cursor / Codex / any MCP-capable agent to bootstrap a new mantle project. Format is always:

```
<localized verb> <SKILL_INSTALL_URL> <localized connector> <SKILL_ARCHETYPE_URL> <localized "for this purpose">: <Archetype name>.
```

Two URLs, no YAML, no form fields. The skill reads both URLs, then [Mantle](../../skills/install/SKILL.md) conducts a soft conversation to gather the rest. The official landing page ([`aotter/mantle-landing`](https://github.com/aotter/mantle-landing)) generates this string dynamically from `src/starterArchetypes.ts` — the files in this directory are direct-paste fallbacks and references for documentation.

## File naming

```
docs/prompts/<archetype>.<locale>.md
```

- `<archetype>` matches a file in [`skills/install/archetypes/`](../../skills/install/archetypes/).
- `<locale>` follows BCP 47. The locale of the prompt only affects the verb / connector phrasing; the site's canonical locale is set later through Mantle's interview.

## URL convention

- `SKILL_INSTALL_URL` = `https://raw.githubusercontent.com/aotter/mantle/<ref>/skills/install/SKILL.md`
- `SKILL_ARCHETYPE_URL` = `https://raw.githubusercontent.com/aotter/mantle/<ref>/skills/install/archetypes/<archetype>.md`

`<ref>` is a pinned release tag (preferred) or `main`. The landing page uses the pinned tag.

## What the prompt does NOT carry

These used to live in a `mantle_request:` YAML block. They are now gathered by Mantle's interview:

- `project_name`
- `brand`
- `description`
- `github_username`
- `locales`

The Mantle thesis says the runtime carries complexity — Mantle, here, gathers what install needs without a pre-flight form.

## Adding a prompt

When a new archetype lands in [`skills/install/archetypes/`](../../skills/install/archetypes/):

1. Add `docs/prompts/<archetype>.<locale>.md` for each supported locale.
2. Update `mantle-landing/src/starterArchetypes.ts` `promptEn` / `promptZh` for the same archetype.
3. Keep the format consistent across locales — only the verb / connector localize.

## See also

- [Epic #97](https://github.com/aotter/mantle/issues/97) — landing-page-prompt no-YAML pivot.
- [`skills/install/SKILL.md`](../../skills/install/SKILL.md) — what the agent does after receiving the prompt.
- [ADR-0013](../adr/0013-agent-provisioned-consumer-projects.md) — the broader install / provision / handoff flow.

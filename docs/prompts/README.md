# Starting prompts

Localized starting-prompt drafts for each starter family (`publication` available; others arrive when the family lands).

## What these are

Text the user pastes into Claude Code / Cursor / Codex / any MCP-capable agent to bootstrap a new mantle project. Each prompt is one localized human-language brief plus a structured `mantle_request:` YAML block the install Skill parses. Agents that read [`skills/install/SKILL.md`](../../skills/install/SKILL.md) recognize the YAML block as the source of truth and skip the long intake interview.

## File naming

```
docs/prompts/<starter-family>.<locale>.md
```

- `<starter-family>` matches the `starter:` enum from the Skill handoff contract — currently `publication` or `blank`.
- `<locale>` follows BCP 47 — `en`, `zh-TW`, `zh-CN`, `ja`, etc. The first locale in the prompt's `mantle_request.locales` list is the canonical site locale; the prompt itself is written in `<locale>`.

The file is referenced by the official starter site (#61) when it ships, and by direct users via the raw GitHub URL.

## Variable convention

Prompts use `{name}` placeholders for values the official site collects from the user:

- `{project_name}` — worker-safe name (lowercase letters, numbers, hyphens)
- `{brand}` — public-facing site name
- `{description}` — one-line site description
- `{github_username}` — the user's GitHub login (becomes `ADMIN_GITHUB_LOGIN`)
- `{locales}` — JSON array, e.g. `["en", "zh-TW"]`
- `{mantle_version}` — pinned npm package version, e.g. `0.0.6-alpha`
- `{template_ref}` — Git ref for starter template copy, e.g. `main` or a release tag
- `{skill_url}` — raw GitHub URL for the install Skill, pinned to the same ref

Substitution happens at request time in the official site's frontend JS — no admin lint, no manifest grammar concept. See [#61's sync](https://github.com/aotter/mantle/issues/61) for the rationale.

## Production smoke

Before treating a prompt as production-ready, walk it on a fresh empty directory + a clean Cloudflare account. The recipe lives in [`starters/publication/README.md` § "Production smoke recipe"](../../starters/publication/README.md).

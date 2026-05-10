# ADR-0013: Agent-provisioned consumer projects

## Status

Accepted (new)

## Date

2026-05-09

## Context

clam-cms is not optimized for a human developer reading a long
installation guide and hand-editing boilerplate. The intended v0.1.0
entry path is:

1. The official site asks for a small set of choices: GitHub username,
   starter, locale(s), and enough public copy to make the first site
   useful.
2. The site produces a localized starting prompt plus a pinned Skill
   URL.
3. A coder agent runs in the user's new repository, copies the chosen
   starter, configures it, installs npm packages, validates it, and
   provisions Cloudflare resources.
4. The deployed site gives the owner an admin sign-in path and an MCP
   URL for ongoing content operations.

This is a different architecture from "SDK docs plus templates." The
template must be safe for agents to mutate, the package dependency
story must work outside this monorepo, and first-run content cannot
depend on an operator MCP session that does not exist yet.

## Decision

Consumer projects are provisioned by an agent, using repo-hosted
Skills as the operational contract.

The source of truth for first-run intent is the website-generated
starting prompt. It may be localized to the user's preferred language,
and it carries structured values such as `starter`, `github_username`,
`locales`, `project_name`, `clam_cms_version`, `template_ref`, and
`skill_url`. The Skill should consume those values instead of running a
long generic interview.

Published npm packages are the runtime dependency source. Starter files
may still be copied from the GitHub repo or a release tag, but
`setup:site` rewrites `workspace:*` dependencies to the requested
`@aotterclam/clam-cms-*` npm version before `pnpm install`. This keeps
consumer projects independent from the monorepo and avoids private-repo
token friction in the install path.

Starter-owned setup scripts are the only supported way to rewrite
standard template fields. Agents should not hand-edit `wrangler.toml`,
`src/clamConfig.ts`, `package.json`, or similar standard fields when a
starter script exists. Hand edits are reserved for actual product
customization.

First-run content is seeded before the owner has an MCP client. The
publication starter writes `initial-seed.json`, then `seed:initial`
applies that public content directly to remote D1/KV during
provisioning. This is an explicit bootstrap exception; ongoing content
operations go through MCP or admin surfaces after owner sign-in.

Cloudflare provisioning is owned by the starter's provision script. It
creates the required free-path resources, writes bindings/secrets,
deploys once with the real origin, applies the seed, and returns the
handoff URLs. Agents should not decompose this into ad-hoc Wrangler
steps unless they are debugging a failed provision.

## Consequences

- Skills become part of the compatibility surface. Updating install or
  provision behavior requires updating the relevant Skill in the same
  change.
- Starter templates must remain script-configurable. Adding a new
  standard field without updating `setup:site` is a regression for
  agent provisioning.
- npm publishing must precede realistic end-user provisioning tests.
  `file:` or workspace dependencies are acceptable only for local SDK
  development.
- The first-run success criterion is product-level: public site,
  owner sign-in, and MCP URL. A deployed but empty site is not success.
- Provisioning must preserve the no-credit-card path. Optional paid or
  billing-gated features must be opt-in after the site is already live.

## Alternatives

- **Human-first docs with manual edits.** Rejected because it makes the
  non-coder path fragile and forces agents to infer boilerplate edits
  from prose.
- **Git dependency only.** Rejected for the default path because private
  repos and Git authentication add friction. Git refs remain useful for
  copying starter files, not for installed runtime dependencies.
- **MCP creates the initial content.** Rejected because MCP requires the
  deployed OAuth/owner loop to exist first. Initial seed is the bridge
  from generated project to operational site.
- **One universal starter.** Rejected. The current publication starter
  is intentionally fixed-manifest during bootstrap; custom workflows
  belong in `blank` or future dedicated starters.

## How to apply

- If a website prompt supplies structured install values, consume them
  directly and only confirm public/resource-name-impacting details.
- Run the starter's `setup:site` script before installing
  dependencies.
- Keep first-run provision scripts on the free Cloudflare path unless
  the user explicitly opts into a paid feature.
- Treat `initial-seed.json` as public bootstrap content, not a secret.
- After provisioning, hand the user to: view the site, sign in as
  owner, then connect an MCP-capable agent.

## Implementation status

- `skills/install/SKILL.md` and `skills/provision/SKILL.md` encode the
  current agent workflow.
- `starters/blog` and `starters/blank` both ship `setup:site`.
- `starters/blog` ships `provision:up` and `seed:initial`.
- `0.0.7-alpha` npm packages are the current install target.

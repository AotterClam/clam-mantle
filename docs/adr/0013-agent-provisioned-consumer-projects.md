# ADR-0013: Agent-provisioned consumer projects

## Status

Accepted (new)

## Date

2026-05-09

## Context

mantle is not optimized for a human developer reading a long
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
`locales`, `project_name`, `mantle_version`, `template_ref`, and
`skill_url`. The Skill should consume those values instead of running a
long generic interview.

Published npm packages are the runtime dependency source. Starter files
may still be copied from the GitHub repo or a release tag, but
`setup:site` rewrites `workspace:*` dependencies to the requested
`@aotter/mantle-*` npm version before `pnpm install`. This keeps
consumer projects independent from the monorepo and avoids private-repo
token friction in the install path.

Starter-owned setup scripts are the only supported way to rewrite
standard template fields. Agents should not hand-edit `wrangler.toml`,
`src/mantleConfig.ts`, `package.json`, or similar standard fields when a
starter script exists. Hand edits are reserved for actual product
customization.

Starter source is copied from pinned public GitHub refs by downloading
source tarballs, not by leaving a normal clone in place. The extracted
project initializes its own Git repo and should only set `origin` after
the user creates or selects a user-owned repository. This avoids agents
accidentally pushing back to the template source.

First-run content is not seeded during real-user install/provision.
Provision creates the operating surface first: public site, owner
sign-in, and Staff/User MCP URLs. After owner sign-in, the operating
agent interviews the owner and asks whether to create initial
pages/posts through Staff MCP or admin authoring. `seed:initial` and
fixture data are reserved for tests and contributor local dev.

Cloudflare provisioning is owned by the starter's provision script. It
creates the required free-path resources, writes bindings/secrets,
deploys once with the real origin, and returns the handoff URLs.
Agents should not decompose this into ad-hoc Wrangler steps unless
they are debugging a failed provision.

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
  owner sign-in, MCP URL, and an owner-approved path to create initial
  content through MCP/admin authoring. A deployed but unauthored site
  can be a valid intermediate checkpoint, not a direct-seed failure.
- Provisioning must preserve the no-credit-card path. Optional paid or
  billing-gated features must be opt-in after the site is already live.

## Alternatives

- **Human-first docs with manual edits.** Rejected because it makes the
  non-coder path fragile and forces agents to infer boilerplate edits
  from prose.
- **Git dependency only.** Rejected for the default path because private
  repos and Git authentication add friction. Git refs remain useful for
  copying starter files, not for installed runtime dependencies.
- **Direct seed creates the initial content.** Rejected for real-user
  onboarding because it bypasses the same operating path we want to
  validate. MCP/admin authoring after owner sign-in is the product
  loop; fixtures and seed utilities remain for tests/local dev.
- **One universal starter.** Rejected. The current publication starter
  is intentionally fixed-manifest during bootstrap; custom workflows
  belong in `blank` or future dedicated starters.

## How to apply

- If a website prompt supplies structured install values, consume them
  directly and only confirm public/resource-name-impacting details.
- Run the starter's `setup:site` script before installing
  dependencies.
- Download starter source as a pinned tarball/zip, extract it, run
  `git init`, and only add a remote that belongs to the user.
- Keep first-run provision scripts on the free Cloudflare path unless
  the user explicitly opts into a paid feature.
- After provisioning, hand the user to: view the site, sign in as
  owner, then connect an MCP-capable agent to create/operate content.

## Implementation status

- `skills/install/SKILL.md` and `skills/provision/SKILL.md` encode the
  current agent workflow.
- `aotter/mantle-starters` and `starters/blank` both
  ship `setup:site`.
- The publication starter ships `provision:up`; `seed:initial` remains
  a test/contributor utility, not part of real-user provisioning.
- `0.0.7-alpha` npm packages are the current install target.

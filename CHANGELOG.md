# Changelog

All notable changes to mantle are documented here.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning once public v0.1.0 tags begin. Pre-v0.1.0 alpha releases may still change public APIs.

## [Unreleased]

## [0.0.7-alpha] - 2026-05-10

### Added

- Contributor governance docs: contributing guide, issue templates, PR template, label guide, release process, security policy, and code of conduct.
- Website archetype ADR for the official-site selector (`presence`, `publication`, `intake`, `transaction`, `reservation`, `community`, `membership`).
- R2-backed media upload lifecycle: create upload, direct PUT, commit, and MCP/admin endpoints.
- Better Auth-backed admin and MCP OAuth/DCR wiring with dual `/staff/mcp` and `/mcp` surfaces.
- Deferred lifecycle after-hook delivery via an optional adapter dispatcher and Cloudflare Workers Queue implementation.

### Changed

- Publication starter replaces the older blog naming and carries the v0.1 agent-provisioned site path.
- Runtime authoring paths now share entry validation for schema `pattern`, `format`, locale membership, unique indexes, and translates parent checks.
- Provision/install docs and Skills now target `0.0.7-alpha`.

## [0.0.6-alpha] - 2026-05-08

### Added

- Alpha rebuild packages and starters for the v0.1.0 development line.

[Unreleased]: https://github.com/aotter/mantle/compare/v0.0.7-alpha...HEAD
[0.0.7-alpha]: https://github.com/aotter/mantle/compare/v0.0.6-alpha...v0.0.7-alpha
[0.0.6-alpha]: https://github.com/aotter/mantle/releases/tag/v0.0.6-alpha

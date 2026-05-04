#!/usr/bin/env node
/**
 * `clam-cms` CLI dispatcher. Subcommands route to their implementing
 * module under `cli/`.
 *
 * v0.1.0 ships `validate` only. OpenAPI emission lives in this package
 * but is not wired to a CLI subcommand; consumers can invoke it via the
 * library API.
 */
import { argv, exit, stderr, stdout } from "node:process";
import { run as runValidate } from "./validate.js";

async function main(): Promise<number> {
  const sub = argv[2];
  if (!sub || sub === "--help" || sub === "-h") {
    stdout.write(`clam-cms - SDK authoring CLI

Usage: clam-cms <subcommand> [options]

Subcommands:
  validate   Static manifest + handler-source validation (Loop 1)

Run \`clam-cms <subcommand> --help\` for subcommand details.
`);
    return sub ? 0 : 2;
  }

  const rest = argv.slice(3);

  switch (sub) {
    case "validate":
      return runValidate(rest);
    default:
      stderr.write(`Unknown subcommand: ${sub}\n`);
      return 2;
  }
}

main().then(
  (code) => exit(code),
  (err) => {
    stderr.write(`internal error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    exit(2);
  },
);

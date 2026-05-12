import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ArchetypeSource } from "./sources.js";

/**
 * Downloads the tarball of a repo+ref into a temp dir and returns the
 * extracted root path (the inner directory after --strip-components=1).
 *
 * Public repos use anonymous codeload.github.com which is fast and
 * rate-limit-friendly. Private repos use the authenticated API
 * tarball endpoint with a bearer token.
 *
 * Auth resolution for private:
 *  1. `process.env.GITHUB_TOKEN` if set
 *  2. `gh auth token` if the GitHub CLI is installed and signed in
 *  3. `~/.config/aotter/token` plain-text file (legacy path; deferred)
 *
 * For v0.1.0 we only ship public-source archetypes. The private path
 * exists so the dispatcher can refuse cleanly with a useful message
 * instead of crashing.
 */
export function downloadAndExtractTarball(
  source: ArchetypeSource,
  ref: string,
): string {
  if (source.kind === "private") {
    throw new Error(
      `Premium starters are not yet available. Source: ${source.repo}. ` +
        `Re-run with a public archetype (presence / publication / intake / blank), ` +
        `or wait for clam-cms-starters-premium content to ship.`,
    );
  }
  const url = `https://codeload.github.com/${source.repo}/tar.gz/${ref}`;
  const extractTo = mkdtempSync(join(tmpdir(), "create-clam-cms-"));
  execFileSync("curl", ["-fsSL", "-o", join(extractTo, "archive.tgz"), url], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  mkdirSync(join(extractTo, "extracted"), { recursive: true });
  execFileSync(
    "tar",
    [
      "-xzf",
      join(extractTo, "archive.tgz"),
      "-C",
      join(extractTo, "extracted"),
      "--strip-components=1",
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  rmSync(join(extractTo, "archive.tgz"));
  return join(extractTo, "extracted");
}

export function cleanupTempDir(path: string): void {
  rmSync(path, { recursive: true, force: true });
}

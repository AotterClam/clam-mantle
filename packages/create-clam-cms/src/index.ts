import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { findLeftovers, substitute, type PlaceholderValues } from "./placeholder.js";
import {
  fetchSourcesJson,
  resolveArchetype,
  resolveTheme,
  STALE_FALLBACK_SOURCES,
  type ArchetypeSource,
  type SourcesJson,
  type ThemeSource,
} from "./sources.js";
import { cleanupTempDir, downloadAndExtractTarball } from "./tarball.js";

export type { ArchetypeSource, SourcesJson, ThemeSource } from "./sources.js";
export type { PlaceholderValues } from "./placeholder.js";
export {
  STARTERS_REPO,
  PREMIUM_REPO,
  STALE_FALLBACK_SOURCES,
  SOURCES,
  ROADMAP_ARCHETYPES,
  fetchSourcesJson,
  resolveArchetype,
  resolveTheme,
  resolveSource,
} from "./sources.js";
export { substitute, findLeftovers } from "./placeholder.js";

export interface CreateOptions {
  readonly archetype: string;
  readonly projectName: string;
  readonly destination: string;
  readonly brand: string;
  readonly description: string;
  readonly locales: ReadonlyArray<string>;
  readonly githubOwner: string;
  readonly summary: string;
  /** Optional theme overlay key (resolves against `sources.themes`). */
  readonly theme?: string | null;
  /** Override the starter ref (e.g., release tag); defaults to `main`. */
  readonly starterRef?: string;
  /** Skip `pnpm install` (used in tests). */
  readonly skipInstall?: boolean;
  /** Skip `git init` (used in tests). */
  readonly skipGitInit?: boolean;
}

export interface RunNotes {
  readonly archetype: string;
  readonly theme: string | null;
  readonly starter_source: string;
  readonly theme_source: string | null;
  readonly overlays: ReadonlyArray<string>;
  readonly files_written: ReadonlyArray<string>;
  readonly next_step: string;
}

const PLACEHOLDER_PATH_BLOCKLIST = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  "dist",
  ".tsbuildinfo",
]);

const FILE_EXTENSIONS_FOR_SUBSTITUTION = new Set([
  ".md",
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".txt",
  ".html",
  ".css",
]);

/**
 * Bootstrap a new clam-cms consumer project from the starters
 * monorepo. Fetches `sources.json` at the requested ref, downloads
 * the tarball, merges `_common/` + `<archetype>/` + (optional)
 * `themes/<theme-key>/` into the destination, substitutes
 * `{{PLACEHOLDER}}` macros, and returns a RunNotes shape.
 */
export async function createClamCms(opts: CreateOptions): Promise<RunNotes> {
  const ref = opts.starterRef ?? "main";
  const sources = await fetchSourcesJson(ref);
  const source = resolveArchetype(opts.archetype, sources);

  const extractedRoot = downloadAndExtractTarball(source, ref);
  try {
    return installFromExtractedRoot({ ...opts, extractedRoot, sources });
  } finally {
    cleanupTempDir(extractedRoot);
  }
}

/**
 * Pure-local variant for tests + reuse: given an already-extracted
 * starters tree, merge + substitute + finalize against `destination`.
 * `sources` defaults to the bundled stale fallback when omitted.
 */
export function installFromExtractedRoot(
  opts: CreateOptions & {
    extractedRoot: string;
    sources?: SourcesJson;
  },
): RunNotes {
  const sources = opts.sources ?? STALE_FALLBACK_SOURCES;
  const source = resolveArchetype(opts.archetype, sources);
  const themeSource = resolveTheme(opts.theme ?? null, sources);

  const filesWritten = mergeStarterIntoDestination({
    extractedRoot: opts.extractedRoot,
    source,
    themeSource,
    destination: opts.destination,
  });
  const values = buildPlaceholderValues(opts);
  substitutePlaceholdersInTree(opts.destination, values, filesWritten);
  renameDotfilesAfterTemplate(opts.destination, filesWritten);
  validateNoLeftovers(opts.destination, filesWritten);
  if (!opts.skipGitInit) {
    gitInit(opts.destination);
  }
  if (!opts.skipInstall) {
    pnpmInstall(opts.destination);
  }
  return {
    archetype: opts.archetype,
    theme: opts.theme ?? null,
    starter_source: `${source.repo}/${source.path}`,
    theme_source: themeSource ? `${source.repo}/${themeSource.path}` : null,
    overlays: source.overlays ?? [],
    files_written: filesWritten,
    next_step:
      "Mantle: replace HTML comments in mantle/site.md with prose from interview; then commit + invoke provision skill.",
  };
}

function buildPlaceholderValues(opts: CreateOptions): PlaceholderValues {
  return {
    ARCHETYPE: opts.archetype,
    BRAND: opts.brand,
    DESCRIPTION: opts.description,
    LOCALES: JSON.stringify(opts.locales),
    CANONICAL_LOCALE: opts.locales[0] ?? "en",
    SITE_URL: "https://example.com",
    GITHUB_OWNER: opts.githubOwner,
    INSTALL_TIMESTAMP: new Date().toISOString(),
    INSTALL_SUMMARY: opts.summary,
  };
}

function mergeStarterIntoDestination(args: {
  extractedRoot: string;
  source: ArchetypeSource;
  themeSource: ThemeSource | null;
  destination: string;
}): ReadonlyArray<string> {
  const layers: string[] = [join(args.extractedRoot, "_common")];
  layers.push(join(args.extractedRoot, args.source.path));
  for (const overlay of args.source.overlays ?? []) {
    layers.push(join(args.extractedRoot, overlay));
  }
  if (args.themeSource) {
    layers.push(join(args.extractedRoot, args.themeSource.path));
  }
  const writtenSet = new Set<string>();
  for (const layer of layers) {
    if (!existsSync(layer)) continue;
    copyTreeRecording(layer, args.destination, writtenSet);
  }
  return [...writtenSet].sort();
}

function copyTreeRecording(
  src: string,
  dst: string,
  writtenRelativeToDst: Set<string>,
): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (PLACEHOLDER_PATH_BLOCKLIST.has(entry.name)) continue;
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);
    if (entry.isDirectory()) {
      cpSync(srcPath, dstPath, { recursive: true });
      for (const f of walkRel(dstPath)) {
        writtenRelativeToDst.add(relative(dst, join(dstPath, f)));
      }
    } else if (entry.isFile()) {
      cpSync(srcPath, dstPath);
      writtenRelativeToDst.add(relative(dst, dstPath));
    }
  }
}

function walkRel(root: string): ReadonlyArray<string> {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = join(root, entry.name);
    if (entry.isDirectory()) {
      for (const sub of walkRel(child)) {
        out.push(join(entry.name, sub));
      }
    } else if (entry.isFile()) {
      out.push(entry.name);
    }
  }
  return out;
}

function substitutePlaceholdersInTree(
  destination: string,
  values: PlaceholderValues,
  files: ReadonlyArray<string>,
): void {
  for (const relPath of files) {
    if (!shouldSubstituteFile(relPath)) continue;
    const abs = join(destination, relPath);
    if (!isRegularFile(abs)) continue;
    const before = readFileSync(abs, "utf8");
    const after = substitute(before, values);
    if (after !== before) {
      writeFileSync(abs, after);
    }
  }
}

function shouldSubstituteFile(relPath: string): boolean {
  if (relPath.endsWith(".template")) return true;
  const lastDot = relPath.lastIndexOf(".");
  if (lastDot === -1) return false;
  return FILE_EXTENSIONS_FOR_SUBSTITUTION.has(relPath.slice(lastDot));
}

function isRegularFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Renames `<name>.template` artifacts to `<name>` after substitution.
 * This is how `_common/AGENTS.md.template` lands as `AGENTS.md` in
 * the user's project. Returns the rewritten file list in place by
 * mutating the destination filesystem; the caller's `files` array is
 * no longer authoritative for `.template`-named paths after this.
 */
function renameDotfilesAfterTemplate(
  destination: string,
  files: ReadonlyArray<string>,
): void {
  for (const relPath of files) {
    if (!relPath.endsWith(".template")) continue;
    const abs = join(destination, relPath);
    if (!isRegularFile(abs)) continue;
    const finalPath = abs.slice(0, -".template".length);
    cpSync(abs, finalPath);
    execFileSync("rm", [abs]);
  }
}

function validateNoLeftovers(
  destination: string,
  files: ReadonlyArray<string>,
): void {
  const leftovers: Array<{ file: string; macros: ReadonlyArray<string> }> = [];
  for (const relPath of files) {
    const finalRel = relPath.endsWith(".template")
      ? relPath.slice(0, -".template".length)
      : relPath;
    const abs = join(destination, finalRel);
    if (!isRegularFile(abs)) continue;
    if (!shouldSubstituteFile(finalRel)) continue;
    const content = readFileSync(abs, "utf8");
    const found = findLeftovers(content);
    if (found.length > 0) {
      leftovers.push({ file: finalRel, macros: found });
    }
  }
  if (leftovers.length > 0) {
    const lines = leftovers.map(
      (l) => `  ${l.file}: ${l.macros.map((m) => `{{${m}}}`).join(", ")}`,
    );
    throw new Error(
      `Found unsubstituted {{PLACEHOLDER}} macros after install:\n${lines.join("\n")}`,
    );
  }
}

function gitInit(destination: string): void {
  execFileSync("git", ["init", "-q"], { cwd: destination, stdio: "inherit" });
}

function pnpmInstall(destination: string): void {
  execFileSync("pnpm", ["install"], { cwd: destination, stdio: "inherit" });
}

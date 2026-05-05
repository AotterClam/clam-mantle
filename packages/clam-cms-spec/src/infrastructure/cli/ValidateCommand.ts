import { readFile, readdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { exit, stdout, stderr, cwd } from "node:process";
import {
  validateDiagnostic,
  type Diagnostic,
} from "../../kernel/diagnostic.js";
import { ValidateManifestsUseCase } from "../../usecase/ValidateManifestsUseCase.js";
import { loadManifestsFromRoot } from "./loadManifests.js";

/**
 * `clam-cms validate` — Loop 1 of the SDK authoring contract
 * (ADR-0007). Walks YAML manifests + handler source, emits
 * structured Diagnostic JSON or pretty text. Exit code 0 on success
 * (no errors; warnings allowed), 1 on any error.
 *
 * Default paths (relative to cwd):
 *   manifests root: ./manifests
 *   handler source: ./src
 *
 * Override with --manifests <dir> / --source <dir>.
 *
 * Output mode:
 *   --format json   → JSON array on stdout (default when piped)
 *   --format text   → pretty-print on stdout (default when TTY)
 *
 * Per the clean-architecture rules this is a thin adapter: it loads
 * files, constructs the request DTO, calls the use case, formats the
 * response. No business logic.
 */
export interface CliArgs {
  readonly manifests: string;
  readonly source: string | null;
  readonly format: "json" | "text";
}

export function parseArgs(rawArgs: ReadonlyArray<string>): CliArgs {
  let manifests = "./manifests";
  let source: string | null = "./src";
  let format: "json" | "text" | null = null;

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === "--manifests") manifests = rawArgs[++i] ?? manifests;
    else if (a === "--source") source = rawArgs[++i] ?? source;
    else if (a === "--no-source") source = null;
    else if (a === "--format") {
      const v = rawArgs[++i];
      if (v !== "json" && v !== "text") {
        throw new Error(`--format must be 'json' or 'text'; got ${JSON.stringify(v)}`);
      }
      format = v;
    } else if (a === "--json") {
      format = "json";
    } else if (a === "--help" || a === "-h") {
      printHelp();
      exit(0);
    } else if (a !== undefined) {
      throw new Error(`Unknown argument: ${a}`);
    }
  }

  if (format === null) {
    format = stdout.isTTY ? "text" : "json";
  }

  return { manifests, source, format };
}

function printHelp(): void {
  stdout.write(`clam-cms validate — Loop 1 static manifest validation

Usage: clam-cms validate [options]

Options:
  --manifests <dir>   Manifest root (default: ./manifests)
  --source <dir>      Handler source root for register-handler grep
                      (default: ./src)
  --no-source         Skip the handler-source grep entirely
  --format <fmt>      'json' or 'text' (default: auto by isTTY)
  --json              Alias for --format json
  -h, --help          This help

Exit codes:
  0  no errors (warnings OK)
  1  one or more errors
  2  CLI invocation problem
`);
}

export async function run(rawArgs: ReadonlyArray<string>): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(rawArgs);
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const manifestsRoot = resolve(cwd(), args.manifests);
  const sourceRoot = args.source ? resolve(cwd(), args.source) : null;

  // 1. Load manifests.
  const { manifests, parseErrors, filePaths } = await loadManifestsFromRoot(args.manifests);

  // 2. Concatenate handler source (if any).
  let handlerSource: string | undefined;
  if (sourceRoot) {
    try {
      handlerSource = await loadHandlerSource(sourceRoot);
    } catch (err) {
      stderr.write(`could not read source root ${sourceRoot}: ${err instanceof Error ? err.message : String(err)}\n`);
      return 2;
    }
  }

  // 3. Execute the use case.
  const result = ValidateManifestsUseCase.run({ manifests, handlerSource, filePaths });
  const cliWarnings: Diagnostic[] = [];

  // The CLI can't reach the runtime DB to read site_config, so it
  // can't run the SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES check —
  // boot does that. Per ADR-0007's leftward-shift principle, surface
  // a warning so the AI author isn't surprised when boot rejects.
  const hasLocalized = manifests.some(
    (m) => m.kind === "Schema" && m.spec.localized === true,
  );
  if (hasLocalized) {
    cliWarnings.push(
      validateDiagnostic({
        code: "SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES",
        severity: "warning",
        path: "cli:locale-check-skipped",
        expected:
          "site_config.locales to declare at least one BCP 47 locale (boot validator will check)",
        message:
          "One or more Schemas declare localized: true. The CLI cannot read site_config; boot will reject if locales are not configured. Verify your CmsConfig.siteDefaults.locales is set.",
      }),
    );
  }

  const diagnostics = [...parseErrors, ...result.diagnostics, ...cliWarnings];
  const errorCount = result.errorCount + parseErrors.filter((d) => d.severity === "error").length;
  const warningCount = result.warningCount + cliWarnings.length + parseErrors.filter((d) => d.severity === "warning").length;

  // 4. Emit.
  if (args.format === "json") {
    stdout.write(JSON.stringify({ diagnostics, errorCount, warningCount }, null, 2) + "\n");
  } else {
    emitText(diagnostics, errorCount, warningCount, manifestsRoot);
  }

  return errorCount > 0 ? 1 : 0;
}

async function loadHandlerSource(root: string): Promise<string> {
  const exts = [".ts", ".tsx", ".js", ".mjs", ".cjs"];
  const chunks: string[] = [];
  async function walk(dir: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const full = join(dir, it.name);
      if (it.isDirectory()) {
        if (it.name === "node_modules" || it.name === "dist" || it.name === ".git") continue;
        await walk(full);
      } else if (it.isFile() && exts.some((e) => it.name.endsWith(e))) {
        try {
          chunks.push(await readFile(full, "utf8"));
        } catch {
          // best-effort: skip unreadable files silently
        }
      }
    }
  }
  await walk(root);
  return chunks.join("\n");
}

function emitText(
  diagnostics: ReadonlyArray<Diagnostic>,
  errorCount: number,
  warningCount: number,
  root: string,
): void {
  if (diagnostics.length === 0) {
    stdout.write(`OK  no issues (root: ${relative(cwd(), root) || root})\n`);
    return;
  }
  for (const d of diagnostics) {
    const sevTag = d.severity === "error" ? "ERROR" : "warn ";
    stdout.write(`[${sevTag}] ${d.code}\n`);
    stdout.write(`         at ${d.path}\n`);
    if (d.expected) stdout.write(`         expected: ${d.expected}\n`);
    if (d.value !== undefined) stdout.write(`         value:    ${formatValue(d.value)}\n`);
    if (d.suggestion) stdout.write(`         suggest:  ${d.suggestion}\n`);
    if (d.message) stdout.write(`         ${d.message}\n`);
    stdout.write("\n");
  }
  stdout.write(`${errorCount} error(s), ${warningCount} warning(s).\n`);
}

function formatValue(v: unknown): string {
  if (typeof v === "string") return JSON.stringify(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

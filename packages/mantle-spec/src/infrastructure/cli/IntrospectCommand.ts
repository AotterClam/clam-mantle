import { exit, stdout, stderr } from "node:process";
import { partitionManifests } from "../../domain/service/ManifestParser.js";
import { loadManifestsFromRoot } from "./loadManifests.js";

/**
 * `mantle introspect` — dump the parsed manifest tree as JSON.
 *
 * Designed for agent consumption: every Schema / View / Procedure /
 * Trigger surfaces with its derived shape (auth, params, http source
 * method+path, lifecycle hooks, builtin op). Output is stable JSON
 * that downstream tooling (CLI scripts, agent prompts, OpenAPI
 * generators) can parse without re-walking the manifest grammar.
 *
 * No side effects. Exit 0 on parse success even if there are
 * grammar warnings — `validate` is the gate; introspect is a
 * read-only inspector.
 */
export interface IntrospectArgs {
  readonly manifests: string;
}

export function parseArgs(rawArgs: ReadonlyArray<string>): IntrospectArgs {
  let manifests = "./manifests";
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === "--manifests") manifests = rawArgs[++i] ?? manifests;
    else if (a === "--help" || a === "-h") {
      printHelp();
      exit(0);
    } else if (a !== undefined) {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { manifests };
}

function printHelp(): void {
  stdout.write(`mantle introspect — dump parsed manifest tree as JSON

Usage: mantle introspect [--manifests <dir>]

Options:
  --manifests <dir>   Manifest root (default: ./manifests)
  -h, --help          This help

Output: JSON object with keys { schemas, views, procedures, triggers,
parseErrors }. Each entry surfaces its derived shape — auth requirements,
http source method+path, builtin op, lifecycle hooks, view params
schema, view filter AST.
`);
}

export async function run(rawArgs: ReadonlyArray<string>): Promise<number> {
  let args: IntrospectArgs;
  try {
    args = parseArgs(rawArgs);
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const { manifests, parseErrors } = await loadManifestsFromRoot(args.manifests);
  const { schemas, views, procedures, triggers } = partitionManifests(manifests);

  const out = {
    schemas: schemas.map((s) => ({
      name: s.metadata.name,
      title: s.spec.title,
      localized: s.spec.localized ?? false,
      lifecycle: s.spec.lifecycle ?? "simple",
      translates: s.spec.translates ?? null,
      uniqueIndexes: s.spec.uniqueIndexes ?? [],
      properties: Object.keys((s.spec.schema as { properties?: Record<string, unknown> }).properties ?? {}),
    })),
    views: views.map((v) => ({
      name: v.metadata.name,
      from: v.spec.from,
      params: v.spec.params ?? null,
      filter: v.spec.filter ?? null,
      orderBy: v.spec.orderBy ?? [],
      fields: v.spec.fields ?? null,
      limit: v.spec.limit ?? null,
      restPath: `/api/views/${v.metadata.name}`,
    })),
    procedures: procedures.map((p) => ({
      name: p.metadata.name,
      handler: p.spec.handler,
      auth: p.spec.requires?.auth ?? null,
      input: p.spec.input,
      output: p.spec.output,
    })),
    triggers: triggers.map((t) => ({
      name: t.metadata.name,
      source: t.spec.source,
      target: t.spec.target,
    })),
    parseErrors: parseErrors,
  };

  stdout.write(JSON.stringify(out, null, 2) + "\n");
  return parseErrors.some((d) => d.severity === "error") ? 1 : 0;
}

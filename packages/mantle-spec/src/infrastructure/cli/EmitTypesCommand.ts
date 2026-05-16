import { stdout, stderr } from "node:process";
import { EmitTypesUseCase } from "../../usecase/EmitTypesUseCase.js";
import { loadManifestsFromRoot } from "./loadManifests.js";

export interface EmitTypesArgs {
  readonly manifests: string;
  readonly namespace: string;
}

export type ParseResult = { kind: "args"; args: EmitTypesArgs } | { kind: "help" };

export function parseArgs(rawArgs: ReadonlyArray<string>): ParseResult {
  let manifests = "./manifests";
  let namespace = "ClamMantle";
  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === "--manifests") manifests = rawArgs[++i] ?? manifests;
    else if (a === "--namespace") namespace = rawArgs[++i] ?? namespace;
    else if (a === "--help" || a === "-h") return { kind: "help" };
    else if (a !== undefined) {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return { kind: "args", args: { manifests, namespace } };
}

function printHelp(): void {
  stdout.write(`mantle emit-types — emit TypeScript .d.ts from manifests

Usage: mantle emit-types [options] > clam-types.d.ts

Options:
  --manifests <dir>   Manifest root (default: ./manifests)
  --namespace <name>  Top-level namespace (default: ClamMantle)
  -h, --help          This help

Output: TypeScript declarations on stdout. One namespace contains:
  - Schemas:    interface Entry_<name> { /* data fields */ }
  - Procedures: interface ProcInput_<name> / ProcOutput_<name>
  - Views:      type ViewRow_<name> = projected row shape
`);
}

export async function run(rawArgs: ReadonlyArray<string>): Promise<number> {
  let parsed: ParseResult;
  try {
    parsed = parseArgs(rawArgs);
  } catch (err) {
    stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }
  if (parsed.kind === "help") {
    printHelp();
    return 0;
  }
  const args = parsed.args;
  const { manifests, parseErrors } = await loadManifestsFromRoot(args.manifests);
  if (parseErrors.some((d) => d.severity === "error")) {
    stderr.write(`Manifest parse errors — run \`mantle validate\` to inspect.\n`);
    return 1;
  }
  const { source } = EmitTypesUseCase.run({ manifests, namespace: args.namespace });
  stdout.write(source);
  return 0;
}

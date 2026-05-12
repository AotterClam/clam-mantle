#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClamCms } from "./index.js";

interface ParsedArgs {
  readonly archetype: string;
  readonly projectName: string;
  readonly brand: string;
  readonly description: string;
  readonly locales: ReadonlyArray<string>;
  readonly canonicalLocale: string;
  readonly githubOwner: string;
  readonly summary: string;
  readonly theme?: string | null;
  readonly starterRef?: string;
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`create-clam-cms: ${msg}`);
  process.exit(1);
});

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const destination = resolve(process.cwd(), args.projectName);
  mkdirSync(destination, { recursive: true });
  const notes = await createClamCms({
    archetype: args.archetype,
    projectName: args.projectName,
    destination,
    brand: args.brand,
    description: args.description,
    locales: args.locales,
    githubOwner: args.githubOwner,
    summary: args.summary,
    theme: args.theme ?? null,
    starterRef: args.starterRef,
  });
  process.stdout.write(`${JSON.stringify(notes, null, 2)}\n`);
}

function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === "--") continue;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq >= 0) {
        flags[token.slice(2, eq)] = token.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith("--")) {
          throw new Error(`Missing value for ${token}`);
        }
        flags[token.slice(2)] = next;
        i += 1;
      }
    } else {
      positional.push(token);
    }
  }
  const archetype = positional[0];
  if (!archetype) {
    throw new Error(
      "Usage: create-clam-cms <archetype> --project-name <name> --brand <...> --description <...> --locales <a,b> --github-owner <login> --summary <one-line> [--theme <key>] [--ref <git-ref>]",
    );
  }
  const projectName = required(flags, "project-name");
  const brand = required(flags, "brand");
  const description = required(flags, "description");
  const localesRaw = required(flags, "locales");
  const locales = localesRaw.split(",").map((s) => s.trim()).filter(Boolean);
  if (locales.length === 0) {
    throw new Error("--locales must include at least one BCP 47 tag");
  }
  const canonicalLocale = flags["canonical-locale"] ?? locales[0]!;
  const githubOwner = required(flags, "github-owner");
  const summary = required(flags, "summary");
  // `--ref` and `--starter-ref` are aliases; `--ref` is the canonical
  // public flag (per Epic #116). `--starter-ref` retained for
  // back-compat with v0.0.8-alpha install Skill invocations.
  const ref = flags["ref"] ?? flags["starter-ref"];
  const theme = flags["theme"];
  return {
    archetype,
    projectName,
    brand,
    description,
    locales,
    canonicalLocale,
    githubOwner,
    summary,
    ...(theme !== undefined ? { theme } : {}),
    ...(ref !== undefined ? { starterRef: ref } : {}),
  };
}

function required(flags: Record<string, string>, name: string): string {
  const v = flags[name];
  if (!v) throw new Error(`Missing --${name}`);
  return v;
}

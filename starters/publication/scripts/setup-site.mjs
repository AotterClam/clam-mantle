#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const args = parseArgs(process.argv.slice(2));
const projectName = requireArg(args, "project-name");
const brand = args.brand ?? projectName;
const description = args.description ?? "";
const locales = (args.locales ?? "en").split(",").map((s) => s.trim()).filter(Boolean);
const origin = args.origin ?? "https://example.com";
const clamCmsVersion = args["clam-cms-version"] ?? readPackageVersion();

if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(projectName)) {
  throw new Error("--project-name must use lowercase letters, numbers, and hyphens");
}
if (locales.length === 0) throw new Error("--locales must include at least one locale");

rewriteFile("wrangler.toml", (text) =>
  text
    .replace(/^name = ".*"$/m, `name = ${JSON.stringify(projectName)}`)
    .replace(
      /(\[\[d1_databases\]\]\nbinding = "DB"\ndatabase_name = )".*"/m,
      `$1${JSON.stringify(`${projectName}-db`)}`,
    ),
);

rewriteFile("src/clamConfig.ts", (text) =>
  text
    .replace(/brand: ".*",/m, `brand: ${JSON.stringify(brand)},`)
    .replace(/title: ".*",/m, `title: ${JSON.stringify(brand)},`)
    .replace(/description: ".*",/m, `description: ${JSON.stringify(description)},`)
    .replace(/origin: ".*",/m, `origin: ${JSON.stringify(origin)},`)
    .replace(/locales: \[[^\]]*\],/m, `locales: ${JSON.stringify(locales)},`),
);

rewriteJson("package.json", (json) => ({
  ...json,
  dependencies: rewriteWorkspaceClamDeps(json.dependencies ?? {}, clamCmsVersion),
}));
rewriteJson("tsconfig.json", (json) => ({ ...json, extends: "./tsconfig.base.json" }));

console.log(`Configured ${projectName}`);
console.log(`Locales: ${locales.join(", ")}`);
console.log(`clam-cms packages: ${clamCmsVersion}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--") continue;
    if (!key?.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    out[key.slice(2)] = value;
    i += 1;
  }
  return out;
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

function rewriteFile(path, fn) {
  writeFileSync(path, fn(readFileSync(path, "utf8")));
}

function rewriteJson(path, fn) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, `${JSON.stringify(fn(json), null, 2)}\n`);
}

function readPackageVersion() {
  const json = JSON.parse(readFileSync("package.json", "utf8"));
  return json.version ?? "0.0.6-alpha";
}

function rewriteWorkspaceClamDeps(deps, version) {
  const out = { ...deps };
  for (const name of [
    "@aotterclam/clam-cms-spec",
    "@aotterclam/clam-cms-runtime",
    "@aotterclam/clam-cms-cloudflare",
  ]) {
    if (out[name] === "workspace:*") out[name] = version;
  }
  return out;
}

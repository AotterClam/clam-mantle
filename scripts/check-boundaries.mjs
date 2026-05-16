#!/usr/bin/env node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const failures = [];

function listFiles(dir, predicate) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(path, predicate));
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function rel(path) {
  return relative(ROOT, path);
}

function fail(path, message) {
  failures.push(`${rel(path)}: ${message}`);
}

function checkRuntimeCloudflareFree() {
  const forbidden = [
    "@cloudflare/",
    "@cloudflare/workers-types",
    "D1Database",
    "KVNamespace",
    "Fetcher",
    "ExecutionContext",
  ];
  const files = listFiles(join(ROOT, "packages/clam-mantle-runtime/src"), (p) =>
    p.endsWith(".ts"),
  );
  for (const file of files) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const token of forbidden) {
      const pattern = token.startsWith("@")
        ? token
        : new RegExp(`\\b${token}\\b`);
      if (
        typeof pattern === "string"
          ? source.includes(pattern)
          : pattern.test(source)
      ) {
        fail(file, `runtime must not reference Cloudflare primitive '${token}'`);
      }
    }
  }
}

function checkPackageDirection() {
  const rules = [
    {
      dir: "packages/clam-mantle-spec/src",
      forbidden: [
        "@aotterclam/clam-mantle-runtime",
        "@aotterclam/clam-mantle-cloudflare",
      ],
      message: "spec must not import runtime/cloudflare packages",
    },
    {
      dir: "packages/clam-mantle-runtime/src",
      forbidden: [
        "@aotterclam/clam-mantle-cloudflare",
        "@aotterclam/clam-mantle-netlify",
      ],
      message: "runtime must not import adapter packages",
    },
  ];

  for (const rule of rules) {
    const files = listFiles(join(ROOT, rule.dir), (p) => p.endsWith(".ts"));
    for (const file of files) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const token of rule.forbidden) {
        if (source.includes(token)) {
          fail(file, `${rule.message}: '${token}'`);
        }
      }
    }
  }
}

checkRuntimeCloudflareFree();
checkPackageDirection();

if (failures.length > 0) {
  console.error("Boundary check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Boundary check passed.");

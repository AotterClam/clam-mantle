#!/usr/bin/env node
/**
 * `pnpm theme:fork <relative-path>` — copy a baseline file into the
 * consumer override directory and uncomment the matching entry in
 * `theme/index.ts`.
 *
 * Usage:
 *   pnpm theme:fork tokens.ts
 *   pnpm theme:fork components/Header.tsx
 *   pnpm theme:fork templates/post.tsx
 *   pnpm theme:fork i18n/en.json
 *   pnpm theme:fork icons.ts
 *
 * Idempotency rules:
 *   - Source must exist in src/theme.default/.
 *   - Destination must NOT exist in src/theme/ (use theme:reset to undo).
 *   - Every fork edits theme/index.ts to register the override.
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STARTER_ROOT = resolve(SCRIPT_DIR, "..");
const BASELINE_DIR = join(STARTER_ROOT, "src", "theme.default");
const THEME_DIR = join(STARTER_ROOT, "src", "theme");
const INDEX_PATH = join(THEME_DIR, "index.ts");

const path = process.argv[2];
if (!path) {
  console.error("usage: pnpm theme:fork <relative-path>");
  console.error("examples: tokens.ts, components/Header.tsx, templates/post.tsx, i18n/en.json");
  process.exit(2);
}

const src = join(BASELINE_DIR, path);
const dest = join(THEME_DIR, path);

if (!existsSync(src)) {
  console.error(`No such baseline file: src/theme.default/${path}`);
  console.error(`(checked ${src})`);
  process.exit(1);
}
if (existsSync(dest)) {
  console.error(`Override already exists at src/theme/${path}.`);
  console.error(`Run \`pnpm theme:reset ${path}\` first if you want to start over.`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);

const slot = pickSlot(path);
const updatedIndex = applyIndexEdit(readFileSync(INDEX_PATH, "utf8"), slot, path);
writeFileSync(INDEX_PATH, updatedIndex);

console.log(`Forked: src/theme.default/${path} → src/theme/${path}`);
console.log(`Registered override in src/theme/index.ts (slot: ${slot.kind}/${slot.key}).`);
console.log(`Edit src/theme/${path} and reload the dev server.`);

function pickSlot(rel) {
  if (rel === "tokens.ts") {
    return { kind: "tokens", key: "tokens" };
  }
  if (rel === "icons.ts") {
    return { kind: "icons", key: "icons" };
  }
  if (rel.startsWith("components/")) {
    const name = baseName(rel);
    return { kind: "components", key: name };
  }
  if (rel.startsWith("templates/")) {
    const name = baseName(rel).replace(/^[A-Z]/, (c) => c.toLowerCase());
    return { kind: "templates", key: name };
  }
  if (rel.startsWith("i18n/")) {
    const locale = baseName(rel).toLowerCase();
    return { kind: "i18n", key: locale };
  }
  console.error(`Unrecognized override path shape: ${rel}`);
  console.error(`Expected one of:`);
  console.error(`  tokens.ts | icons.ts | components/<Name>.tsx |`);
  console.error(`  templates/<name>.tsx | i18n/<locale>.json`);
  process.exit(2);
}

function baseName(rel) {
  return rel.split("/").slice(-1)[0].replace(/\.[^.]+$/, "");
}

function applyIndexEdit(source, slot, rel) {
  const importLine = makeImportLine(slot, rel);
  const entryLine = makeEntryLine(slot);
  let updated = source;
  if (!updated.includes(importLine)) {
    const importsBlockEnd = updated.indexOf("\n\n", updated.indexOf("ThemeOverride"));
    updated = updated.slice(0, importsBlockEnd) + "\n" + importLine + updated.slice(importsBlockEnd);
  }
  updated = ensureEntry(updated, slot, entryLine);
  return updated;
}

function makeImportLine(slot, rel) {
  switch (slot.kind) {
    case "tokens":
      return `import { TOKENS_CSS as ForkedTokens } from "./tokens.js";`;
    case "icons":
      return `import { icon as forkedIcon } from "./icons.js";`;
    case "components":
      return `import { ${slot.key} as ${slot.key}Override } from "./components/${slot.key}.js";`;
    case "templates":
      return `import { ${slot.key}Template as ${slot.key}Override } from "./templates/${capitalize(slot.key)}.js";`;
    case "i18n":
      return `import ${camelLocale(slot.key)}Override from "./i18n/${rel.split("/").slice(-1)[0]}";`;
  }
}

function makeEntryLine(slot) {
  switch (slot.kind) {
    case "tokens":
      return `  tokens: ForkedTokens,`;
    case "icons":
      // For consumer-driven icons override we don't auto-wire the
      // map (icon() already merges baseline + theme). Just leave a
      // hint comment.
      return `  icons: { /* add { name: "<svg path>" } entries here */ },`;
    case "components":
      return `  components: { ...(overrides.components ?? {}), ${slot.key}: ${slot.key}Override },`;
    case "templates":
      return `  templates: { ...(overrides.templates ?? {}), ${slot.key}: ${slot.key}Override },`;
    case "i18n":
      return `  i18n: { ...(overrides.i18n ?? {}), "${slot.key}": ${camelLocale(slot.key)}Override },`;
  }
}

function camelLocale(loc) {
  return loc.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ensureEntry(source, slot, entryLine) {
  // Drop the matching commented-out example, then insert the live entry
  // before the closing `};` of the object literal.
  const exampleByKind = {
    tokens: /^\s*\/\/ tokens:.*$\n/m,
    extraCss: /^\s*\/\/ extraCss:.*$\n/m,
    icons: /^\s*\/\/ icons:.*$\n/m,
    i18n: /^\s*\/\/ i18n:.*$\n/m,
    components: /^\s*\/\/ components:.*$\n/m,
    templates: /^\s*\/\/ templates:.*$\n/m,
  };
  let out = source;
  const exampleRe = exampleByKind[slot.kind];
  if (exampleRe) out = out.replace(exampleRe, "");

  // Already a live entry of this kind? Replace it.
  const liveRe = liveEntryPattern(slot.kind);
  if (liveRe.test(out)) {
    out = out.replace(liveRe, entryLine);
    return out;
  }

  // Insert before the closing `};` of `const overrides: ThemeOverride = {`.
  const objStart = out.indexOf("const overrides: ThemeOverride = {");
  if (objStart < 0) {
    throw new Error("Could not locate `const overrides: ThemeOverride = {` in theme/index.ts");
  }
  const closingIdx = out.indexOf("\n};", objStart);
  if (closingIdx < 0) {
    throw new Error("Could not locate closing `};` of overrides object in theme/index.ts");
  }
  return out.slice(0, closingIdx) + "\n" + entryLine + out.slice(closingIdx);
}

function liveEntryPattern(kind) {
  return new RegExp(`^\\s{2}${kind}:.*$\\n`, "m");
}

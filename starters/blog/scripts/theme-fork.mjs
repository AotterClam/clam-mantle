#!/usr/bin/env node
/**
 * `pnpm theme:fork <relative-path>` — drop a baseline file (or, for
 * icons, a stub) into the consumer override directory and register
 * it in theme/index.ts.
 *
 * Usage:
 *   pnpm theme:fork tokens.ts
 *   pnpm theme:fork icons.ts                 (writes a stub, not a copy)
 *   pnpm theme:fork components/Header.tsx
 *   pnpm theme:fork templates/post.tsx
 *   pnpm theme:fork i18n/en.json
 *
 * Idempotency:
 *   - destination must not already exist (pnpm theme:reset to undo)
 *   - re-forking a sibling slot (e.g. Footer after Header) merges
 *     into the existing components / templates / i18n block
 */
import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, posix } from "node:path";
import {
  pickSlot,
  baselineSourcePath,
  overridePath,
  importLineFor,
  entryValueFor,
  isTopLevelSlot,
  ICONS_STUB,
  INDEX_PATH,
  SlotError,
} from "./_theme-slots.mjs";

const path = process.argv[2];
if (!path) {
  console.error("usage: pnpm theme:fork <relative-path>");
  console.error("examples: tokens.ts, components/Header.tsx, templates/post.tsx, i18n/en.json, icons.ts");
  process.exit(2);
}

let slot;
try {
  slot = pickSlot(path);
} catch (e) {
  if (e instanceof SlotError) {
    console.error(e.message);
    console.error("Expected: tokens.ts | icons.ts | components/<Name>.tsx | templates/<name>.tsx | i18n/<locale>.json");
    process.exit(2);
  }
  throw e;
}

const dest = overridePath(path);
if (existsSync(dest)) {
  console.error(`Override already exists at src/theme/${path}.`);
  console.error(`Run \`pnpm theme:reset ${path}\` first if you want to start over.`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
if (slot.kind === "icons") {
  writeFileSync(dest, ICONS_STUB);
} else if (slot.kind === "components" || slot.kind === "templates") {
  const src = baselineSourcePath(path);
  if (!existsSync(src)) {
    console.error(`No such baseline file: ${src}`);
    process.exit(1);
  }
  // Rewrite relative imports that resolve inside theme.default/ so the
  // forked file keeps using baseline siblings via an absolute-from-fork
  // path instead of breaking on a missing local sibling. Consumer-level
  // imports (e.g. ../../i18n/) are left alone — those resolve to the
  // same target from the fork location.
  writeFileSync(dest, rewriteBaselineImports(readFileSync(src, "utf8"), path));
} else {
  const src = baselineSourcePath(path);
  if (!existsSync(src)) {
    console.error(`No such baseline file: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
}

writeFileSync(INDEX_PATH, applyIndexEdit(readFileSync(INDEX_PATH, "utf8"), slot));

console.log(`Forked: src/theme/${path} ${slot.kind === "icons" ? "(stub)" : "(copied from baseline)"}`);
console.log(`Registered override in src/theme/index.ts.`);
console.log(`Edit src/theme/${path} and reload the dev server.`);

function rewriteBaselineImports(content, rel) {
  const sourceDir = posix.dirname(rel);
  const originDir = posix.join("theme.default", sourceDir === "." ? "" : sourceDir);
  const forkDir = posix.join("theme", sourceDir === "." ? "" : sourceDir);
  return content.replace(/(from\s+["'])(\.[^"']+)(["'])/g, (match, lead, importPath, tail) => {
    const target = posix.normalize(posix.join(originDir, importPath));
    if (target !== "theme.default" && !target.startsWith("theme.default/")) return match;
    let next = posix.relative(forkDir, target);
    if (!next.startsWith(".")) next = "./" + next;
    return `${lead}${next}${tail}`;
  });
}

function applyIndexEdit(source, slot) {
  let updated = ensureImport(source, importLineFor(slot));
  updated = stripExampleComment(updated, slot.kind);
  updated = upsertEntry(updated, slot);
  return updated;
}

function ensureImport(source, importLine) {
  const lines = source.split("\n");
  // Whole-line equality check — `source.includes(importLine)` would
  // match a commented-out example line that happens to contain the
  // exact same statement (the empty-template comments at top of
  // theme/index.ts list every default-export form).
  if (lines.some((l) => l === importLine)) return source;
  let lastImportIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("import ")) lastImportIdx = i;
  }
  lines.splice(lastImportIdx + 1, 0, importLine);
  return lines.join("\n");
}

function stripExampleComment(source, kind) {
  // Remove the canned `// <kind>: ...` line from the empty-template comments.
  const re = new RegExp(`^\\s*// ${kind}:.*$\\n`, "m");
  return source.replace(re, "");
}

function upsertEntry(source, slot) {
  if (isTopLevelSlot(slot)) {
    // Replace existing `<kind>: ...,` line if present, else insert before closing.
    const liveRe = new RegExp(`^  ${slot.kind}:.*$\\n`, "m");
    const newLine = `  ${slot.kind}: ${entryValueFor(slot)},\n`;
    if (liveRe.test(source)) return source.replace(liveRe, newLine);
    return insertBeforeClose(source, newLine);
  }
  // Nested slot — components / templates / i18n.
  const block = locateBlock(source, slot.kind);
  const innerLine = `    ${entryValueFor(slot)},\n`;
  if (!block) {
    const newBlock = `  ${slot.kind}: {\n${innerLine}  },\n`;
    return insertBeforeClose(source, newBlock);
  }
  // Already a block — splice the new key inside it. Replace if a
  // line for that exact key exists already.
  const keyRe = lineRegexForKey(slot);
  if (keyRe.test(block.body)) {
    return source.slice(0, block.bodyStart) + block.body.replace(keyRe, innerLine) + source.slice(block.bodyEnd);
  }
  return source.slice(0, block.bodyEnd) + innerLine + source.slice(block.bodyEnd);
}

function locateBlock(source, kind) {
  // Match `  <kind>: {` opening through the next `  },`.
  const open = source.indexOf(`  ${kind}: {`);
  if (open < 0) return null;
  const bodyStart = source.indexOf("\n", open) + 1;
  const close = source.indexOf("  },", bodyStart);
  if (close < 0) return null;
  return {
    bodyStart,
    bodyEnd: close,
    body: source.slice(bodyStart, close),
  };
}

function lineRegexForKey(slot) {
  // Match `    Header: ...,\n` etc. Keys are alphanum + _ for components/templates;
  // i18n uses quoted locale strings.
  if (slot.kind === "i18n") {
    return new RegExp(`^    "${slot.key}":.*$\\n`, "m");
  }
  return new RegExp(`^    ${slot.key}:.*$\\n`, "m");
}

function insertBeforeClose(source, line) {
  const closeIdx = source.indexOf("\n};\n", source.indexOf("const overrides: ThemeOverride = {"));
  if (closeIdx < 0) {
    throw new Error("Could not locate closing `};` of overrides object in theme/index.ts");
  }
  return source.slice(0, closeIdx + 1) + line + source.slice(closeIdx + 1);
}

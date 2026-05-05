#!/usr/bin/env node
/**
 * `pnpm theme:reset <relative-path>` — undo a theme:fork. Removes
 * the override file and strips the matching entry + import from
 * theme/index.ts. Restores the matching example comment if a known
 * stock example existed.
 *
 * Usage:
 *   pnpm theme:reset tokens.ts
 *   pnpm theme:reset components/Header.tsx
 *   pnpm theme:reset templates/post.tsx
 *   pnpm theme:reset i18n/en.json
 *   pnpm theme:reset icons.ts
 */
import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync, rmdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  pickSlot,
  overridePath,
  importLineFor,
  entryValueFor,
  isTopLevelSlot,
  INDEX_PATH,
  SlotError,
} from "./_theme-slots.mjs";

const path = process.argv[2];
if (!path) {
  console.error("usage: pnpm theme:reset <relative-path>");
  process.exit(2);
}

let slot;
try {
  slot = pickSlot(path);
} catch (e) {
  if (e instanceof SlotError) {
    console.error(e.message);
    process.exit(2);
  }
  throw e;
}

const target = overridePath(path);
if (!existsSync(target)) {
  console.error(`No override at src/theme/${path}.`);
  process.exit(1);
}

rmSync(target);
// Remove the parent directory if it was a slot subdir (components / templates / i18n)
// and is now empty — keeps `src/theme/` tidy across fork/reset cycles.
const parent = dirname(target);
if (parent !== INDEX_PATH.replace(/\/index\.ts$/, "") && readdirSync(parent).length === 0) {
  rmdirSync(parent);
}

let index = readFileSync(INDEX_PATH, "utf8");
index = removeEntry(index, slot);
index = removeImport(index, importLineFor(slot));
writeFileSync(INDEX_PATH, index);

console.log(`Reset: src/theme/${path} removed; theme/index.ts entry + import stripped.`);

function removeImport(source, importLine) {
  // Drop the exact import line we wrote at fork time.
  const re = new RegExp(`^${escape(importLine)}\\n`, "m");
  return source.replace(re, "");
}

function removeEntry(source, slot) {
  if (isTopLevelSlot(slot)) {
    const re = new RegExp(`^  ${slot.kind}:.*$\\n`, "m");
    return source.replace(re, "");
  }
  // Nested — strip the inner key, then drop the whole block if it's empty.
  const keyRe =
    slot.kind === "i18n"
      ? new RegExp(`^    "${slot.key}":.*$\\n`, "m")
      : new RegExp(`^    ${slot.key}:.*$\\n`, "m");
  let updated = source.replace(keyRe, "");
  // If the block is now empty (`<kind>: {\n  },`), drop the block.
  const emptyBlock = new RegExp(`^  ${slot.kind}: \\{\\n  \\},\\n`, "m");
  updated = updated.replace(emptyBlock, "");
  return updated;
}

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

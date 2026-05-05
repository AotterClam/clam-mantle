#!/usr/bin/env node
/**
 * `pnpm theme:reset <relative-path>` — undo a `theme:fork`. Removes
 * the file from src/theme/<path> and strips the matching entry +
 * import from src/theme/index.ts. Leaves the baseline untouched.
 *
 * Usage:
 *   pnpm theme:reset tokens.ts
 *   pnpm theme:reset components/Header.tsx
 *   pnpm theme:reset templates/post.tsx
 */
import { existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STARTER_ROOT = resolve(SCRIPT_DIR, "..");
const THEME_DIR = join(STARTER_ROOT, "src", "theme");
const INDEX_PATH = join(THEME_DIR, "index.ts");

const path = process.argv[2];
if (!path) {
  console.error("usage: pnpm theme:reset <relative-path>");
  process.exit(2);
}

const target = join(THEME_DIR, path);
if (!existsSync(target)) {
  console.error(`No override at src/theme/${path}.`);
  process.exit(1);
}

const slot = pickSlot(path);

rmSync(target);

let index = readFileSync(INDEX_PATH, "utf8");
index = stripEntry(index, slot);
index = stripImport(index, slot);
writeFileSync(INDEX_PATH, index);

console.log(`Reset: src/theme/${path} removed; theme/index.ts stripped of ${slot.kind}/${slot.key} override.`);
console.log(`Baseline restored.`);

function pickSlot(rel) {
  if (rel === "tokens.ts") return { kind: "tokens", key: "tokens" };
  if (rel === "icons.ts") return { kind: "icons", key: "icons" };
  if (rel.startsWith("components/")) {
    return { kind: "components", key: baseName(rel) };
  }
  if (rel.startsWith("templates/")) {
    const name = baseName(rel).replace(/^[A-Z]/, (c) => c.toLowerCase());
    return { kind: "templates", key: name };
  }
  if (rel.startsWith("i18n/")) {
    return { kind: "i18n", key: baseName(rel).toLowerCase() };
  }
  console.error(`Unrecognized path shape: ${rel}`);
  process.exit(2);
}

function baseName(rel) {
  return rel.split("/").slice(-1)[0].replace(/\.[^.]+$/, "");
}

function stripEntry(source, slot) {
  // Whole-line strip of the `<kind>:` entry we previously inserted.
  const re = new RegExp(`^\\s{2}${slot.kind}:.*$\\n`, "m");
  return source.replace(re, "");
}

function stripImport(source, slot) {
  // Best-effort: strip our specific import line shapes.
  const patterns = {
    tokens: /^import \{ TOKENS_CSS as ForkedTokens \} from "\.\/tokens\.js";\n/m,
    icons: /^import \{ icon as forkedIcon \} from "\.\/icons\.js";\n/m,
    components: new RegExp(
      `^import \\{ ${slot.key} as ${slot.key}Override \\} from "\\./components/${slot.key}\\.js";\\n`,
      "m",
    ),
    templates: new RegExp(
      `^import \\{ ${slot.key}Template as ${slot.key}Override \\} from "\\./templates/${capitalize(slot.key)}\\.js";\\n`,
      "m",
    ),
    i18n: new RegExp(
      `^import ${camelLocale(slot.key)}Override from "\\./i18n/${slot.key.replace(/-/g, "-")}\\.json";\\n`,
      "m",
    ),
  };
  return source.replace(patterns[slot.kind] ?? /(?!)/, "");
}

function camelLocale(loc) {
  return loc.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

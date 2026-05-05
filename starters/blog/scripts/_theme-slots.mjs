/**
 * Shared between scripts/theme-fork.mjs and scripts/theme-reset.mjs.
 * Single source of truth for the override-slot grammar and the
 * theme/index.ts edit shape.
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const STARTER_ROOT = resolve(SCRIPT_DIR, "..");
export const SRC_DIR = join(STARTER_ROOT, "src");
export const BASELINE_DIR = join(SRC_DIR, "theme.default");
export const I18N_DIR = join(SRC_DIR, "i18n");
export const THEME_DIR = join(SRC_DIR, "theme");
export const INDEX_PATH = join(THEME_DIR, "index.ts");

/**
 * Classify a relative override path. The kinds map 1:1 to the
 * `ThemeOverride` interface keys plus a couple of synthetics
 * (`tokens` is the only top-level slot that carries through to
 * the override surface unchanged; `icons` is generated from a
 * stub rather than copied verbatim).
 *
 * - tokens.ts                     → { kind: "tokens" }
 * - icons.ts                      → { kind: "icons" }            (stub)
 * - components/<Name>.tsx         → { kind: "components", key }
 * - templates/<name>.tsx          → { kind: "templates", key }
 * - i18n/<locale>.json            → { kind: "i18n", key }
 *
 * Throws on unrecognized shapes; callers exit with usage help.
 */
export function pickSlot(rel) {
  if (rel === "tokens.ts") return { kind: "tokens" };
  if (rel === "icons.ts") return { kind: "icons" };
  if (rel.startsWith("components/")) {
    return { kind: "components", key: stem(rel) };
  }
  if (rel.startsWith("templates/")) {
    return { kind: "templates", key: stem(rel) };
  }
  if (rel.startsWith("i18n/")) {
    return { kind: "i18n", key: stem(rel).toLowerCase() };
  }
  throw new SlotError(`Unrecognized override path shape: ${rel}`);
}

export class SlotError extends Error {}

/**
 * Where the baseline copy of an override lives. i18n bundles are
 * hoisted to consumer level (locale set is site-specific, not
 * theme-specific) so they source from `src/i18n/`, not
 * `theme.default/i18n/`.
 */
export function baselineSourcePath(rel) {
  if (rel.startsWith("i18n/")) return join(I18N_DIR, rel.slice("i18n/".length));
  return join(BASELINE_DIR, rel);
}

export function overridePath(rel) {
  return join(THEME_DIR, rel);
}

function stem(rel) {
  return rel.split("/").slice(-1)[0].replace(/\.[^.]+$/, "");
}

export function camelLocale(loc) {
  return loc.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * The import line we write into theme/index.ts for a given slot. The
 * generated alias names are the canonical shape this script owns;
 * theme:reset matches them verbatim.
 */
export function importLineFor(slot) {
  switch (slot.kind) {
    case "tokens":
      return `import { TOKENS_CSS as ForkedTokens } from "./tokens.js";`;
    case "icons":
      return `import customIcons from "./icons.js";`;
    case "components":
      return `import { ${slot.key} as ${slot.key}Override } from "./components/${slot.key}.js";`;
    case "templates":
      return `import { ${slot.key}Template as ${slot.key}Override } from "./templates/${slot.key}.js";`;
    case "i18n":
      return `import ${camelLocale(slot.key)}Override from "./i18n/${slot.key === "zh-tw" ? "zh-TW" : slot.key}.json";`;
  }
}

/**
 * The override-object value for a slot. For top-level slots this is
 * the whole RHS of `<kind>: <expr>,`. For nested slots
 * (components / templates / i18n), it is the inner-key/value pair
 * (e.g. `Header: HeaderOverride`).
 */
export function entryValueFor(slot) {
  switch (slot.kind) {
    case "tokens":
      return "ForkedTokens";
    case "icons":
      return "customIcons";
    case "components":
      return `${slot.key}: ${slot.key}Override`;
    case "templates":
      return `${slot.key}: ${slot.key}Override`;
    case "i18n":
      return `"${slot.key}": ${camelLocale(slot.key)}Override`;
  }
}

export function isTopLevelSlot(slot) {
  return slot.kind === "tokens" || slot.kind === "icons";
}

/**
 * Stub content for a freshly-forked icons.ts. Unlike other slots,
 * this one ISN'T a copy of the baseline (the baseline ships an
 * `icon()` function consumers don't replace) — they want to extend
 * or shadow specific paths in the registry. So we write a small
 * keyed-map stub that the override surface spreads over baseline.
 */
export const ICONS_STUB = `/**
 * Override or extend baseline icons. Each value is the inner SVG
 * markup (no <svg> wrapper). Same key as a baseline icon replaces
 * it; new keys add to the set.
 */
const customIcons: Record<string, string> = {
  // logo: '<path d="M..."/>',
};
export default customIcons;
`;

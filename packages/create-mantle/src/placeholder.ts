/**
 * `{{PLACEHOLDER}}` substitution per ADR-0016. Single pass over the
 * input string; unknown macros are LEFT IN PLACE so the caller can
 * detect leftovers before claiming install success.
 */
export interface PlaceholderValues {
  readonly ARCHETYPE: string;
  readonly BRAND: string;
  readonly DESCRIPTION: string;
  readonly LOCALES: string;
  readonly CANONICAL_LOCALE: string;
  readonly SITE_URL: string;
  readonly GITHUB_OWNER: string;
  readonly INSTALL_TIMESTAMP: string;
  readonly INSTALL_SUMMARY: string;
}

const MACRO_NAMES = [
  "ARCHETYPE",
  "BRAND",
  "DESCRIPTION",
  "LOCALES",
  "CANONICAL_LOCALE",
  "SITE_URL",
  "GITHUB_OWNER",
  "INSTALL_TIMESTAMP",
  "INSTALL_SUMMARY",
] as const;

export function substitute(input: string, values: PlaceholderValues): string {
  let out = input;
  for (const name of MACRO_NAMES) {
    out = out.split(`{{${name}}}`).join(values[name]);
  }
  return out;
}

export function findLeftovers(input: string): ReadonlyArray<string> {
  const matches = input.matchAll(/\{\{([A-Z_]+)\}\}/g);
  const seen = new Set<string>();
  for (const m of matches) {
    if (m[1]) seen.add(m[1]);
  }
  return [...seen];
}

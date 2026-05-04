import type { SchemaManifest } from "./grammar.js";
import { bestMatch, manifestPath } from "./diagnose.js";
import { canonicalizeLocaleList } from "../locale.js";
import {
  bootDiagnostic,
  validateDiagnostic,
  type Diagnostic,
  type Phase,
} from "../diagnostic.js";

/**
 * Cross-Schema checks for the locale + translates grammar additions
 * introduced in ADR-0010. Runs in both the validate phase (CLI,
 * pre-deploy) and the boot phase (Worker init, post-deploy). The
 * static parts (parent existence, join-field membership in both
 * Schemas, translates-implies-localized) don't need any environment.
 * The site-locales check needs the runtime config, so it runs only
 * when `siteLocales` is provided.
 *
 * Caller passes the phase tag so diagnostics surface as
 * `validate/<code>` or `boot/<code>` per ADR-0008.
 */
export interface CrossSchemaCheckInput {
  readonly schemas: ReadonlyArray<SchemaManifest>;
  readonly phase: Extract<Phase, "validate" | "boot">;
  /** Site config locales (ordered, first is canonical). When absent,
   *  the SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES check is skipped —
   *  validate-from-CLI flows can't reach the runtime D1 to read this.
   *  Boot always has access and should pass it. */
  readonly siteLocales?: ReadonlyArray<string>;
  /** Optional file-path index for nicer diagnostic paths in the
   *  validate phase. Same shape as the validate module's filePaths. */
  readonly filePaths?: ReadonlyMap<string, { file: string; docIndex: number }>;
}

export function checkLocaleAndTranslates(input: CrossSchemaCheckInput): Diagnostic[] {
  const { schemas, phase, siteLocales, filePaths } = input;
  const out: Diagnostic[] = [];
  const schemasByName = new Map<string, SchemaManifest>();
  for (const s of schemas) schemasByName.set(s.metadata.name, s);

  const siteLocalesGiven = siteLocales !== undefined;

  // Canonicalize the site locales the caller passed before any
  // schema-vs-locales check uses them. The /admin/api/site-config
  // PATCH endpoint already validates on write, but legacy site_config
  // rows from before that endpoint shipped (or D1-direct edits) can
  // still feed malformed values in here. Boot-phase diagnostic gives
  // operators a deploy-time signal instead of silent runtime failure.
  let validSiteLocalesCount = siteLocalesGiven ? siteLocales.length : 0;
  if (siteLocalesGiven && siteLocales.length > 0) {
    const { valid, invalid } = canonicalizeLocaleList(siteLocales);
    validSiteLocalesCount = valid.length;
    if (invalid.length > 0) {
      out.push(
        emit(phase, {
          code: "INVALID_LOCALE",
          severity: "error",
          path: "site_config/locales",
          value: invalid,
          expected: "BCP 47 locale tags (e.g. 'en' or 'zh-TW', case-insensitive)",
          message: `site_config.locales contains invalid entries: ${invalid.map((s) => `'${s}'`).join(", ")}. Fix via the Settings page or D1 directly.`,
        }),
      );
    }
  }
  // Effectively empty: either the row is empty/absent, or every entry
  // was malformed and dropped. Use this for the per-Schema check so an
  // all-malformed config still surfaces SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES
  // alongside INVALID_LOCALE — operator gets the full blast-radius signal.
  const siteLocalesEmpty = siteLocalesGiven && validSiteLocalesCount === 0;

  for (const s of schemas) {
    const localized = s.spec.localized === true;
    const translates = s.spec.translates;
    const path = (jsonPointer: string) =>
      manifestPath("Schema", s.metadata.name, jsonPointer, filePaths);

    if (localized && siteLocalesGiven && siteLocalesEmpty) {
      out.push(
        emit(phase, {
          code: "SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES",
          severity: "error",
          path: path("/spec/localized"),
          value: true,
          expected: "site_config.locales to declare at least one BCP 47 locale before any Schema can be localized",
          message: `Schema '${s.metadata.name}' is localized but the site has no locales configured. Set site_config.locales (e.g. ['en'] or ['zh-TW']) or remove localized: true.`,
        }),
      );
    }

    if (translates) {
      // Local check (parser already enforced this, but parser doesn't
      // run on already-parsed manifest objects fed straight to boot —
      // keep the safety net here too).
      if (!localized) {
        out.push(
          emit(phase, {
            code: "TRANSLATES_REQUIRES_LOCALIZED",
            severity: "error",
            path: path("/spec/translates"),
            expected: "Schema.spec.localized: true (a non-localized translation table is meaningless)",
            message: `Schema '${s.metadata.name}' declares translates but is not localized: true.`,
          }),
        );
        continue;
      }
      const parent = schemasByName.get(translates.parent);
      if (!parent) {
        out.push(
          emit(phase, {
            code: "TRANSLATES_PARENT_UNKNOWN",
            severity: "error",
            path: path("/spec/translates/parent"),
            value: translates.parent,
            expected: "name of a declared Schema",
            candidates: [...schemasByName.keys()],
            suggestion: bestMatch(translates.parent, [...schemasByName.keys()]),
            message: `Schema '${s.metadata.name}' translates.parent references unknown Schema '${translates.parent}'.`,
          }),
        );
        continue;
      }
      if (parent.spec.localized === true) {
        out.push(
          emit(phase, {
            code: "TRANSLATES_PARENT_IS_LOCALIZED",
            severity: "error",
            path: path("/spec/translates/parent"),
            value: translates.parent,
            expected: "parent Schema must NOT be localized (it carries the non-translatable facts; translation rows are this Schema)",
            message: `Schema '${s.metadata.name}' translates.parent '${translates.parent}' is itself localized. The parent should hold non-translatable facts (e.g. sku, price); the localized child holds the translatable fields.`,
          }),
        );
      }
      const parentProps = propertyKeys(parent);
      if (!parentProps.has(translates.on)) {
        out.push(
          emit(phase, {
            code: "TRANSLATES_FIELD_NOT_IN_PARENT",
            severity: "error",
            path: path("/spec/translates/on"),
            value: translates.on,
            expected: `field declared in Schema '${parent.metadata.name}' spec.schema.properties`,
            candidates: [...parentProps].sort(),
            suggestion: bestMatch(translates.on, [...parentProps]),
            message: `Schema '${s.metadata.name}' translates.on field '${translates.on}' is not declared on parent Schema '${parent.metadata.name}'.`,
          }),
        );
      }
      const childProps = propertyKeys(s);
      if (!childProps.has(translates.on)) {
        out.push(
          emit(phase, {
            code: "TRANSLATES_FIELD_NOT_IN_CHILD",
            severity: "error",
            path: path("/spec/translates/on"),
            value: translates.on,
            expected: `field declared in Schema '${s.metadata.name}' spec.schema.properties`,
            candidates: [...childProps].sort(),
            suggestion: bestMatch(translates.on, [...childProps]),
            message: `Schema '${s.metadata.name}' translates.on field '${translates.on}' is not declared on this Schema's own properties. Both parent and child must declare the join field.`,
          }),
        );
      }
    }
  }

  return out;
}

function emit(
  phase: Extract<Phase, "validate" | "boot">,
  payload: Parameters<typeof validateDiagnostic>[0],
): Diagnostic {
  return phase === "validate" ? validateDiagnostic(payload) : bootDiagnostic(payload);
}

function propertyKeys(s: SchemaManifest): Set<string> {
  const props = (s.spec.schema as { properties?: Record<string, unknown> }).properties ?? {};
  return new Set(Object.keys(props));
}

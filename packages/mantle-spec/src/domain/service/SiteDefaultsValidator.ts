import {
  MEDIA_PURPOSE_SLUG_PATTERN,
  type MediaPurposePolicy,
  type SiteDefaults,
} from "../model/SiteConfig.js";
import { canonicalizeLocaleList } from "./LocaleCanonicalizer.js";

/**
 * Synchronous fail-fast for `siteDefaults`. Throws
 * `InvalidSiteDefaultsError` when any declared locale fails BCP 47
 * canonicalization. Throws `InvalidMediaPurposesError` when any
 * declared `media.purposes` entry's `name` fails the slug pattern,
 * its `required` mime list is empty, or its `maxBytes` map is
 * missing entries for any required mime. Brand / title / description /
 * origin are not validated — only the fields whose values carry
 * semantics the runtime depends on.
 *
 * Lives in spec (not runtime) because it's pure validation against
 * the `SiteConfig` contract — no env, no DB. Runtime calls this at
 * module init (`bootInit`) so a typo in `mantleConfig.ts >
 * siteDefaults` surfaces in `wrangler tail` before the worker
 * accepts traffic.
 */
export class InvalidSiteDefaultsError extends Error {
  constructor(public readonly invalidLocales: ReadonlyArray<string>) {
    super(
      `Invalid BCP 47 locale tag(s) in CmsConfig.siteDefaults.locales: ` +
        invalidLocales.map((s) => `'${s}'`).join(", ") +
        `. Use BCP 47 form like 'en' or 'zh-TW' — the canonicalizer ` +
        `accepts mixed case ('zh-tw' / 'ZH_TW'), but the structure must ` +
        `be a 2/3-letter language plus optional 2-letter region. ` +
        `See ADR-0010 / cms-spec's canonicalizeLocaleList.`,
    );
    this.name = "InvalidSiteDefaultsError";
  }
}

export interface MediaPurposeIssue {
  readonly name: string;
  readonly reason:
    | "invalid-slug"
    | "empty-required"
    | "maxBytes-missing-mime"
    | "maxBytes-non-positive";
  readonly detail?: string;
}

export class InvalidMediaPurposesError extends Error {
  constructor(public readonly issues: ReadonlyArray<MediaPurposeIssue>) {
    super(
      `Invalid media purpose declaration(s) in CmsConfig.siteDefaults.media.purposes: ` +
        issues
          .map((i) => {
            const tag = `'${i.name || "(unnamed)"}'`;
            switch (i.reason) {
              case "invalid-slug":
                return `${tag} fails slug pattern ${MEDIA_PURPOSE_SLUG_PATTERN.source}`;
              case "empty-required":
                return `${tag} declares no required mimes (need at least one)`;
              case "maxBytes-missing-mime":
                return `${tag} maxBytes is missing entries: ${i.detail}`;
              case "maxBytes-non-positive":
                return `${tag} maxBytes has non-positive entries: ${i.detail}`;
            }
          })
          .join("; ") +
        `. Each purpose's name must match ` +
        `${MEDIA_PURPOSE_SLUG_PATTERN.source} (lowercase alphanumerics, ` +
        `dash-separated, no leading/trailing or repeated dashes); ` +
        `required mimes are the closed set the variants manifest must ` +
        `cover; maxBytes caps each variant's declared byteSize and MUST ` +
        `name every mime in required. See aotter/mantle#272.`,
    );
    this.name = "InvalidMediaPurposesError";
  }
}

export function assertSiteDefaultsCanonical(
  defaults: SiteDefaults | undefined,
): void {
  if (defaults?.locales && defaults.locales.length > 0) {
    const { invalid } = canonicalizeLocaleList(defaults.locales);
    if (invalid.length > 0) throw new InvalidSiteDefaultsError(invalid);
  }
  const purposes = defaults?.media?.purposes;
  if (purposes && purposes.length > 0) {
    const issues = collectMediaPurposeIssues(purposes);
    if (issues.length > 0) throw new InvalidMediaPurposesError(issues);
  }
}

function collectMediaPurposeIssues(
  purposes: ReadonlyArray<MediaPurposePolicy>,
): ReadonlyArray<MediaPurposeIssue> {
  const out: MediaPurposeIssue[] = [];
  for (const p of purposes) {
    if (!MEDIA_PURPOSE_SLUG_PATTERN.test(p.name)) {
      out.push({ name: p.name, reason: "invalid-slug" });
      continue;
    }
    if (p.required.length === 0) {
      out.push({ name: p.name, reason: "empty-required" });
      continue;
    }
    const missing = p.required.filter((mime) => !(mime in p.maxBytes));
    if (missing.length > 0) {
      out.push({
        name: p.name,
        reason: "maxBytes-missing-mime",
        detail: missing.join(", "),
      });
      continue;
    }
    const nonPositive = p.required.filter(
      (mime) => !(typeof p.maxBytes[mime] === "number" && p.maxBytes[mime]! > 0),
    );
    if (nonPositive.length > 0) {
      out.push({
        name: p.name,
        reason: "maxBytes-non-positive",
        detail: nonPositive.map((m) => `${m}=${p.maxBytes[m]}`).join(", "),
      });
    }
  }
  return out;
}

/**
 * Sources of truth for archetype → starter-monorepo + theme dispatch.
 *
 * `create-mantle` fetches `sources.json` from the `mantle-starters`
 * monorepo at runtime (per Epic #116 / sub-issue #121). Adding a new
 * archetype or theme = update `sources.json` in that repo. The npx
 * package does not need a new version unless the merge logic changes.
 *
 * Fetch failures fall back to a bundled snapshot (`STALE_FALLBACK_SOURCES`)
 * so installs can still complete in offline / GH-unreachable cases. The
 * snapshot tracks the current starter monorepo layout and is updated
 * whenever the live shape evolves significantly.
 */

export const STARTERS_REPO = "aotter/mantle-starters";
export const PREMIUM_REPO = "aotter/mantle-starters-premium";

export type SourceKind = "public" | "private";

export interface ThemeSource {
  readonly path: string;
}

export interface ArchetypeSourceEntry {
  readonly path: string;
  readonly overlays?: readonly string[];
}

export interface SourcesJson {
  readonly archetypes: Readonly<Record<string, ArchetypeSourceEntry>>;
  readonly themes: Readonly<Record<string, ThemeSource>>;
  readonly roadmap: readonly string[];
}

/**
 * Resolved view used by the install pipeline. `kind` + `repo` are
 * derived (currently always public + STARTERS_REPO); the rest mirrors
 * `ArchetypeSourceEntry`.
 */
export interface ArchetypeSource extends ArchetypeSourceEntry {
  readonly kind: SourceKind;
  readonly repo: string;
}

/**
 * Bundled stale snapshot of `sources.json`. Matches the **current**
 * `mantle-starters` layout: publication starter shared across the
 * presence / publication / intake archetypes, with `intake` carrying
 * a layered overlay. After the 1:1 starter split lands in
 * `mantle-starters` (Epic #116 sub-issue #6), the live
 * `sources.json` will drop overlays and add 1:1 dirs — runtime fetch
 * picks that up automatically; this fallback only matters when GH
 * is unreachable.
 */
export const STALE_FALLBACK_SOURCES: SourcesJson = {
  archetypes: {
    presence: { path: "publication" },
    publication: { path: "publication" },
    intake: { path: "publication", overlays: ["intake"] },
    blank: { path: "blank" },
  },
  themes: {},
  roadmap: ["transaction", "reservation", "community", "membership"],
};

/**
 * Fetch the live `sources.json` from `mantle-starters` at the given
 * ref. Returns the bundled stale snapshot on any fetch / validation
 * failure, after writing a warning to stderr — installs proceed.
 */
export async function fetchSourcesJson(ref: string): Promise<SourcesJson> {
  const url = `https://raw.githubusercontent.com/${STARTERS_REPO}/${encodeURIComponent(ref)}/sources.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const data: unknown = await res.json();
    return validateSourcesJson(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(
      `create-mantle: failed to fetch ${url} (${msg}); using bundled stale fallback.\n`,
    );
    return STALE_FALLBACK_SOURCES;
  }
}

function validateSourcesJson(data: unknown): SourcesJson {
  if (typeof data !== "object" || data === null) {
    throw new Error("sources.json: root is not an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.archetypes !== "object" || obj.archetypes === null) {
    throw new Error("sources.json: missing archetypes object");
  }
  if (typeof obj.themes !== "object" || obj.themes === null) {
    throw new Error("sources.json: missing themes object");
  }
  if (!Array.isArray(obj.roadmap)) {
    throw new Error("sources.json: roadmap is not an array");
  }
  return data as SourcesJson;
}

/**
 * Resolve an archetype to its starter path + (optional) overlays.
 * Throws with a helpful message for roadmap or unknown values.
 */
export function resolveArchetype(
  archetype: string,
  sources: SourcesJson,
): ArchetypeSource {
  const hit = sources.archetypes[archetype];
  if (hit) {
    return {
      kind: "public",
      repo: STARTERS_REPO,
      path: hit.path,
      overlays: hit.overlays,
    };
  }
  if (sources.roadmap.includes(archetype)) {
    throw new Error(
      `Archetype "${archetype}" is roadmap-only and does not have a starter yet. ` +
        `The install Skill should have refused before invoking create-mantle.`,
    );
  }
  throw new Error(
    `Unknown archetype "${archetype}". Known: ${Object.keys(sources.archetypes).join(", ")}.`,
  );
}

/**
 * Resolve an optional theme key to its overlay path. Returns `null`
 * for missing/empty key; throws on unknown key.
 */
export function resolveTheme(
  theme: string | null | undefined,
  sources: SourcesJson,
): ThemeSource | null {
  if (!theme) return null;
  const hit = sources.themes[theme];
  if (hit) return hit;
  const known = Object.keys(sources.themes);
  const list = known.length > 0 ? known.join(", ") : "(no themes in bundled stale fallback)";
  throw new Error(`Unknown theme "${theme}". Known: ${list}.`);
}

/**
 * @deprecated use `resolveArchetype(archetype, sources)` with a fetched
 * `SourcesJson`. Retained for back-compat with v0.0.8-alpha tests; runs
 * against the bundled stale fallback only.
 */
export function resolveSource(archetype: string): ArchetypeSource {
  return resolveArchetype(archetype, STALE_FALLBACK_SOURCES);
}

/**
 * @deprecated read `sources.roadmap` from a fetched `SourcesJson`
 * instead. Re-exported for back-compat.
 */
export const ROADMAP_ARCHETYPES: readonly string[] =
  STALE_FALLBACK_SOURCES.roadmap;

/**
 * @deprecated read `sources.archetypes` from a fetched `SourcesJson`
 * instead. Re-exported as a flat snapshot for back-compat.
 */
export const SOURCES: Readonly<Record<string, ArchetypeSource>> = Object.fromEntries(
  Object.entries(STALE_FALLBACK_SOURCES.archetypes).map(([k, v]) => [
    k,
    {
      kind: "public" as const,
      repo: STARTERS_REPO,
      path: v.path,
      ...(v.overlays !== undefined ? { overlays: v.overlays } : {}),
    },
  ]),
);

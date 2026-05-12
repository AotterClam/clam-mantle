/**
 * Source map for archetype → starters-monorepo dispatch.
 *
 * Each entry resolves the archetype keyword the install Skill receives
 * (from `mantle-landing/src/starterArchetypes.ts`) into a concrete
 * path under a mantle-starters monorepo plus optional overlays.
 *
 * Bundled into the npm package at publish time; to add or move
 * archetypes, ship a new `create-mantle` version.
 */
export type SourceKind = "public" | "private";

export interface ArchetypeSource {
  readonly kind: SourceKind;
  readonly repo: string;
  readonly path: string;
  readonly overlays?: ReadonlyArray<string>;
}

export const SOURCES: Readonly<Record<string, ArchetypeSource>> = {
  presence: {
    kind: "public",
    repo: "aotter/mantle-starters",
    path: "publication",
  },
  publication: {
    kind: "public",
    repo: "aotter/mantle-starters",
    path: "publication",
  },
  intake: {
    kind: "public",
    repo: "aotter/mantle-starters",
    path: "publication",
    overlays: ["intake"],
  },
  blank: {
    kind: "public",
    repo: "aotter/mantle-starters",
    path: "blank",
  },
};

export const PREMIUM_REPO = "aotter/mantle-starters-premium";

/**
 * Roadmap archetypes that the install Skill should soft-refuse on
 * (per skills/install/archetypes/*.md "Refuse path"). create-mantle
 * itself never installs these; the skill never invokes us for them.
 */
export const ROADMAP_ARCHETYPES: ReadonlyArray<string> = [
  "transaction",
  "reservation",
  "community",
  "membership",
];

export function resolveSource(archetype: string): ArchetypeSource {
  const hit = SOURCES[archetype];
  if (hit) return hit;
  if (ROADMAP_ARCHETYPES.includes(archetype)) {
    throw new Error(
      `Archetype "${archetype}" is roadmap-only and does not have a starter yet. ` +
        `The install Skill should have refused before invoking create-mantle.`,
    );
  }
  throw new Error(
    `Unknown archetype "${archetype}". Known: ${Object.keys(SOURCES).join(", ")}.`,
  );
}

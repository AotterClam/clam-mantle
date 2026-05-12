import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROADMAP_ARCHETYPES,
  SOURCES,
  STALE_FALLBACK_SOURCES,
  STARTERS_REPO,
  fetchSourcesJson,
  resolveArchetype,
  resolveSource,
  resolveTheme,
  type SourcesJson,
} from "../src/sources.js";

describe("resolveSource (back-compat, stale fallback)", () => {
  it("returns presence → publication starter (no overlay)", () => {
    const s = resolveSource("presence");
    expect(s.kind).toBe("public");
    expect(s.repo).toBe("aotter/mantle-starters");
    expect(s.path).toBe("publication");
    expect(s.overlays).toBeUndefined();
  });

  it("returns intake → publication starter with intake overlay", () => {
    const s = resolveSource("intake");
    expect(s.path).toBe("publication");
    expect(s.overlays).toEqual(["intake"]);
  });

  it("returns blank → blank starter", () => {
    const s = resolveSource("blank");
    expect(s.path).toBe("blank");
  });

  it("throws helpful message for roadmap archetypes", () => {
    for (const k of ROADMAP_ARCHETYPES) {
      expect(() => resolveSource(k)).toThrow(/roadmap-only/);
    }
  });

  it("throws unknown-archetype message with the known list", () => {
    expect(() => resolveSource("does-not-exist")).toThrow(/Unknown archetype/);
    expect(() => resolveSource("does-not-exist")).toThrow(/blank/);
  });

  it("every roadmap archetype is absent from SOURCES", () => {
    for (const k of ROADMAP_ARCHETYPES) {
      expect(SOURCES[k]).toBeUndefined();
    }
  });
});

describe("resolveArchetype (live sources)", () => {
  const live: SourcesJson = {
    archetypes: {
      presence: { path: "presence" },
      publication: { path: "publication" },
      intake: { path: "intake" },
      blank: { path: "blank" },
    },
    themes: {
      "l4-minimal-ink": { path: "themes/l4-minimal-ink" },
    },
    roadmap: ["transaction"],
  };

  it("resolves against the supplied SourcesJson (1:1 paths)", () => {
    expect(resolveArchetype("presence", live).path).toBe("presence");
    expect(resolveArchetype("intake", live).path).toBe("intake");
    expect(resolveArchetype("intake", live).overlays).toBeUndefined();
  });

  it("returns repo = STARTERS_REPO and kind = public", () => {
    const s = resolveArchetype("publication", live);
    expect(s.kind).toBe("public");
    expect(s.repo).toBe(STARTERS_REPO);
  });

  it("throws for roadmap archetype in the supplied sources", () => {
    expect(() => resolveArchetype("transaction", live)).toThrow(/roadmap-only/);
  });

  it("throws for unknown archetype with sources.archetypes list", () => {
    expect(() => resolveArchetype("foo", live)).toThrow(/Unknown archetype/);
  });
});

describe("resolveTheme", () => {
  const sources: SourcesJson = {
    archetypes: { publication: { path: "publication" } },
    themes: {
      "l4-minimal-ink": { path: "themes/l4-minimal-ink" },
      "l4-editorial-warm": { path: "themes/l4-editorial-warm" },
    },
    roadmap: [],
  };

  it("returns null for absent / empty / null theme", () => {
    expect(resolveTheme(null, sources)).toBeNull();
    expect(resolveTheme(undefined, sources)).toBeNull();
    expect(resolveTheme("", sources)).toBeNull();
  });

  it("resolves known theme key to its path", () => {
    expect(resolveTheme("l4-minimal-ink", sources)).toEqual({
      path: "themes/l4-minimal-ink",
    });
  });

  it("throws for unknown theme with known list", () => {
    expect(() => resolveTheme("l4-not-real", sources)).toThrow(/Unknown theme/);
    expect(() => resolveTheme("l4-not-real", sources)).toThrow(
      /l4-minimal-ink/,
    );
  });

  it("error message handles empty theme map gracefully", () => {
    const empty: SourcesJson = {
      archetypes: { publication: { path: "publication" } },
      themes: {},
      roadmap: [],
    };
    expect(() => resolveTheme("any", empty)).toThrow(/no themes/);
  });
});

describe("fetchSourcesJson", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns parsed sources.json on success", async () => {
    const payload: SourcesJson = {
      archetypes: { publication: { path: "publication" } },
      themes: { "l4-minimal-ink": { path: "themes/l4-minimal-ink" } },
      roadmap: ["transaction"],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => payload,
    } as unknown as Response);

    const got = await fetchSourcesJson("main");
    expect(got).toEqual(payload);
  });

  it("falls back to STALE_FALLBACK_SOURCES on HTTP error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({}),
    } as unknown as Response);
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    const got = await fetchSourcesJson("v9.99.99-nope");
    expect(got).toBe(STALE_FALLBACK_SOURCES);
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("falls back on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const got = await fetchSourcesJson("main");
    expect(got).toBe(STALE_FALLBACK_SOURCES);
  });

  it("falls back on schema validation failure", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ archetypes: "wrong" }),
    } as unknown as Response);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const got = await fetchSourcesJson("main");
    expect(got).toBe(STALE_FALLBACK_SOURCES);
  });

  it("URL-encodes ref segment to handle slashes/special chars", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => STALE_FALLBACK_SOURCES,
      } as unknown as Response);

    await fetchSourcesJson("feat/my branch");
    expect(fetchSpy).toHaveBeenCalledWith(
      `https://raw.githubusercontent.com/${STARTERS_REPO}/feat%2Fmy%20branch/sources.json`,
    );
  });
});

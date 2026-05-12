import { describe, expect, it } from "vitest";
import {
  ROADMAP_ARCHETYPES,
  SOURCES,
  resolveSource,
} from "../src/sources.js";

describe("resolveSource", () => {
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

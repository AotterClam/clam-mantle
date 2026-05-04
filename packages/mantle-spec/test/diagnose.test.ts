import { describe, expect, it } from "vitest";
import { bestMatch, manifestPath } from "../src/manifests/diagnose.js";

describe("manifestPath", () => {
  it("falls back to synthetic URI when no file paths map", () => {
    expect(manifestPath("Schema", "posts", "/spec/schema/properties")).toBe(
      "manifest:Schema/posts#/spec/schema/properties",
    );
  });

  it("uses file path + docIndex when supplied", () => {
    const fp = new Map([
      ["Schema/posts", { file: "/abs/manifests/posts.yaml", docIndex: 0 }],
    ]);
    expect(manifestPath("Schema", "posts", "/spec/title", fp)).toBe(
      "/abs/manifests/posts.yaml#/0/spec/title",
    );
  });

  it("falls back to synthetic when filePaths lacks the key", () => {
    const fp = new Map<string, { file: string; docIndex: number }>();
    expect(manifestPath("View", "recent", "/spec/from", fp)).toBe(
      "manifest:View/recent#/spec/from",
    );
  });
});

describe("bestMatch (Levenshtein < 3)", () => {
  it("finds 1-edit typo", () => {
    expect(bestMatch("posst", ["posts", "tags", "media"])).toBe("posts");
  });

  it("finds 2-edit typo", () => {
    expect(bestMatch("postz", ["posts"])).toBe("posts");
  });

  it("returns undefined when no candidate within threshold (≥3)", () => {
    expect(bestMatch("foobar", ["posts", "tags", "media"])).toBeUndefined();
  });

  it("returns the closest of multiple near matches", () => {
    expect(bestMatch("postt", ["posts", "porst"])).toBe("posts");
  });

  it("returns undefined for empty candidate list", () => {
    expect(bestMatch("anything", [])).toBeUndefined();
  });

  it("treats exact matches as distance 0 (well within < 3)", () => {
    expect(bestMatch("posts", ["posts", "tags"])).toBe("posts");
  });

  it("handles empty target string", () => {
    // Distance equals candidate length; "ab" is length 2 → matches (< 3).
    expect(bestMatch("", ["ab", "abcd"])).toBe("ab");
  });
});

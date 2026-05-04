import { describe, expect, it } from "vitest";
import {
  canonicalizeLocaleList,
  fromUrlLocale,
  InvalidLocaleError,
  LOCALE_SHAPED_SEGMENT,
  safeCanonicalLocale,
  toCanonicalLocale,
  toUrlLocale,
  URL_LOCALE,
  URL_SEGMENT,
} from "../src/locale.js";

describe("toCanonicalLocale", () => {
  it("preserves canonical form for already-canonical values", () => {
    expect(toCanonicalLocale("zh-TW")).toBe("zh-TW");
    expect(toCanonicalLocale("en-US")).toBe("en-US");
    expect(toCanonicalLocale("pt-BR")).toBe("pt-BR");
    expect(toCanonicalLocale("en")).toBe("en");
  });

  it("uppercases the region", () => {
    expect(toCanonicalLocale("zh-tw")).toBe("zh-TW");
    expect(toCanonicalLocale("en-us")).toBe("en-US");
  });

  it("lowercases the language", () => {
    expect(toCanonicalLocale("ZH-TW")).toBe("zh-TW");
    expect(toCanonicalLocale("EN-us")).toBe("en-US");
  });

  it("accepts underscore separator", () => {
    expect(toCanonicalLocale("zh_TW")).toBe("zh-TW");
    expect(toCanonicalLocale("en_us")).toBe("en-US");
  });

  it("accepts no-separator 4-char form", () => {
    expect(toCanonicalLocale("zhTW")).toBe("zh-TW");
    expect(toCanonicalLocale("enus")).toBe("en-US");
  });

  it("accepts language-only", () => {
    expect(toCanonicalLocale("zh")).toBe("zh");
    expect(toCanonicalLocale("EN")).toBe("en");
  });

  it("throws InvalidLocaleError on empty input", () => {
    expect(() => toCanonicalLocale("")).toThrow(InvalidLocaleError);
  });

  it("throws InvalidLocaleError on non-string", () => {
    // @ts-expect-error testing non-string runtime input
    expect(() => toCanonicalLocale(undefined)).toThrow(InvalidLocaleError);
    // @ts-expect-error testing non-string runtime input
    expect(() => toCanonicalLocale(null)).toThrow(InvalidLocaleError);
  });

  it("throws on garbage input", () => {
    expect(() => toCanonicalLocale("12-34")).toThrow(InvalidLocaleError);
    expect(() => toCanonicalLocale("z")).toThrow(InvalidLocaleError);
    expect(() => toCanonicalLocale("zhongwen")).toThrow(InvalidLocaleError);
    expect(() => toCanonicalLocale("zh-T")).toThrow(InvalidLocaleError);
    // Note: "zh-TW-extra" leaks through as "zh-TW" because the parser
    // only reads parts[0] and parts[1] without bounding parts.length.
    // This matches POC behavior (port-exact); fixing it is a separate
    // concern.
  });

  it("InvalidLocaleError carries the original input in its message", () => {
    try {
      toCanonicalLocale("garbage");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidLocaleError);
      expect((err as Error).message).toContain("garbage");
      expect((err as Error).name).toBe("InvalidLocaleError");
    }
  });
});

describe("safeCanonicalLocale", () => {
  it("returns canonical form for valid input", () => {
    expect(safeCanonicalLocale("zh-tw")).toBe("zh-TW");
  });

  it("returns input unchanged for invalid input (no throw)", () => {
    expect(safeCanonicalLocale("garbage")).toBe("garbage");
    expect(safeCanonicalLocale("")).toBe("");
  });
});

describe("canonicalizeLocaleList", () => {
  it("partitions valid and invalid in one pass", () => {
    const { valid, invalid } = canonicalizeLocaleList(["zh-tw", "en", "garbage", "12"]);
    expect(valid).toEqual(["zh-TW", "en"]);
    expect(invalid).toEqual(["garbage", "12"]);
  });

  it("preserves input order in valid", () => {
    const { valid } = canonicalizeLocaleList(["en", "zh-tw", "ja"]);
    expect(valid).toEqual(["en", "zh-TW", "ja"]);
  });

  it("dedupes after canonicalization", () => {
    const { valid } = canonicalizeLocaleList(["zh-tw", "zh-TW", "ZH_tw"]);
    expect(valid).toEqual(["zh-TW"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(canonicalizeLocaleList([])).toEqual({ valid: [], invalid: [] });
  });

  it("handles all-invalid input", () => {
    const { valid, invalid } = canonicalizeLocaleList(["", "garbage", "12-34"]);
    expect(valid).toEqual([]);
    expect(invalid).toEqual(["", "garbage", "12-34"]);
  });
});

describe("toUrlLocale / fromUrlLocale roundtrip", () => {
  it("toUrlLocale lowercases canonical form", () => {
    expect(toUrlLocale("zh-TW")).toBe("zh-tw");
    expect(toUrlLocale("en-US")).toBe("en-us");
    expect(toUrlLocale("en")).toBe("en");
  });

  it("fromUrlLocale parses URL form back to canonical", () => {
    expect(fromUrlLocale("zh-tw")).toBe("zh-TW");
    expect(fromUrlLocale("en")).toBe("en");
  });

  it("canonical → URL → canonical is a stable roundtrip", () => {
    for (const canonical of ["zh-TW", "en-US", "pt-BR", "en", "ja"]) {
      expect(fromUrlLocale(toUrlLocale(canonical))).toBe(canonical);
    }
  });
});

describe("URL_LOCALE regex", () => {
  it("matches lowercase BCP 47 forms", () => {
    expect(URL_LOCALE.test("zh-tw")).toBe(true);
    expect(URL_LOCALE.test("en")).toBe(true);
    expect(URL_LOCALE.test("en-us")).toBe(true);
  });

  it("rejects uppercase, mixed-case, garbage", () => {
    expect(URL_LOCALE.test("zh-TW")).toBe(false);
    expect(URL_LOCALE.test("ZH-tw")).toBe(false);
    expect(URL_LOCALE.test("foo")).toBe(false);
    expect(URL_LOCALE.test("")).toBe(false);
  });
});

describe("LOCALE_SHAPED_SEGMENT regex", () => {
  it("matches case-insensitively (for redirect detection)", () => {
    expect(LOCALE_SHAPED_SEGMENT.test("zh-TW")).toBe(true);
    expect(LOCALE_SHAPED_SEGMENT.test("ZH-tw")).toBe(true);
    expect(LOCALE_SHAPED_SEGMENT.test("zh-tw")).toBe(true);
  });
});

describe("URL_SEGMENT regex", () => {
  it("matches lowercase slugs", () => {
    expect(URL_SEGMENT.test("posts")).toBe(true);
    expect(URL_SEGMENT.test("hello-world")).toBe(true);
    expect(URL_SEGMENT.test("a")).toBe(true);
    expect(URL_SEGMENT.test("123")).toBe(true);
  });

  it("rejects uppercase, leading hyphen, special chars", () => {
    expect(URL_SEGMENT.test("Posts")).toBe(false);
    expect(URL_SEGMENT.test("-leading")).toBe(false);
    expect(URL_SEGMENT.test("with space")).toBe(false);
    expect(URL_SEGMENT.test("")).toBe(false);
  });
});

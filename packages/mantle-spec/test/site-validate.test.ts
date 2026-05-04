import { describe, expect, it } from "vitest";
import {
  assertSiteDefaultsCanonical,
  InvalidSiteDefaultsError,
} from "../src/site/validate.js";

describe("assertSiteDefaultsCanonical (boot-time fail-fast)", () => {
  it("accepts canonical BCP 47 locales", () => {
    expect(() =>
      assertSiteDefaultsCanonical({ locales: ["en", "zh-TW", "ja"] }),
    ).not.toThrow();
  });

  it("accepts case-recoverable non-canonical input (canonicalizer normalises)", () => {
    expect(() =>
      assertSiteDefaultsCanonical({ locales: ["en", "zh-tw"] }),
    ).not.toThrow();
  });

  it("throws InvalidSiteDefaultsError on garbage", () => {
    expect(() =>
      assertSiteDefaultsCanonical({ locales: ["english", ""] }),
    ).toThrow(InvalidSiteDefaultsError);
  });

  it("InvalidSiteDefaultsError carries the invalid list", () => {
    try {
      assertSiteDefaultsCanonical({ locales: ["english", "zh-TW", ""] });
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidSiteDefaultsError);
      expect((e as InvalidSiteDefaultsError).invalidLocales).toEqual([
        "english",
        "",
      ]);
    }
  });

  it("no-op when locales is empty / undefined", () => {
    expect(() => assertSiteDefaultsCanonical(undefined)).not.toThrow();
    expect(() => assertSiteDefaultsCanonical({})).not.toThrow();
    expect(() => assertSiteDefaultsCanonical({ locales: [] })).not.toThrow();
  });

  it("no-op when only brand / title are set", () => {
    expect(() =>
      assertSiteDefaultsCanonical({ brand: "X", title: "Y" }),
    ).not.toThrow();
  });
});

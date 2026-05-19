import { describe, expect, it } from "vitest";
import {
  assertSiteDefaultsCanonical,
  InvalidMediaPurposesError,
  InvalidSiteDefaultsError,
} from "../src/domain/service/SiteDefaultsValidator.js";

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

  describe("media.purposes slug validation (#262)", () => {
    it("accepts slug-shaped purposes", () => {
      expect(() =>
        assertSiteDefaultsCanonical({
          media: { purposes: ["post-cover", "product-cover", "product-gallery", "a1b2"] },
        }),
      ).not.toThrow();
    });

    it("no-op when media is undefined or purposes is empty", () => {
      expect(() => assertSiteDefaultsCanonical({ media: undefined })).not.toThrow();
      expect(() => assertSiteDefaultsCanonical({ media: {} })).not.toThrow();
      expect(() => assertSiteDefaultsCanonical({ media: { purposes: [] } })).not.toThrow();
    });

    it("throws InvalidMediaPurposesError on non-slug entries", () => {
      expect(() =>
        assertSiteDefaultsCanonical({ media: { purposes: ["Post-Cover"] } }),
      ).toThrow(InvalidMediaPurposesError);
      expect(() =>
        assertSiteDefaultsCanonical({ media: { purposes: ["post_cover"] } }),
      ).toThrow(InvalidMediaPurposesError);
      expect(() =>
        assertSiteDefaultsCanonical({ media: { purposes: ["-leading"] } }),
      ).toThrow(InvalidMediaPurposesError);
      expect(() =>
        assertSiteDefaultsCanonical({ media: { purposes: ["trailing-"] } }),
      ).toThrow(InvalidMediaPurposesError);
      expect(() =>
        assertSiteDefaultsCanonical({ media: { purposes: ["double--dash"] } }),
      ).toThrow(InvalidMediaPurposesError);
      expect(() =>
        assertSiteDefaultsCanonical({ media: { purposes: [""] } }),
      ).toThrow(InvalidMediaPurposesError);
    });

    it("InvalidMediaPurposesError carries the invalid list", () => {
      try {
        assertSiteDefaultsCanonical({
          media: { purposes: ["ok-one", "Bad", "ok-two", "also_bad"] },
        });
        throw new Error("expected throw");
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidMediaPurposesError);
        expect((e as InvalidMediaPurposesError).invalidPurposes).toEqual([
          "Bad",
          "also_bad",
        ]);
      }
    });
  });
});

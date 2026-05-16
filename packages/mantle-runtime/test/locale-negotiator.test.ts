import { describe, expect, it } from "vitest";
import type { SiteConfig } from "@aotterclam/mantle-spec";
import {
  inferLocaleFromPath,
  isKnownLocale,
  siteConfigFromDefaults,
} from "../src/domain/service/LocaleNegotiator.js";

const site: SiteConfig = {
  title: "T",
  description: "",
  origin: "",
  locales: ["en", "zh-TW"],
  canonicalLocale: "en",
  brand: "T",
};

describe("inferLocaleFromPath", () => {
  it("returns canonical locale for the root path", () => {
    expect(inferLocaleFromPath("/", site)).toBe("en");
  });
  it("matches a valid first segment case-insensitively, preserves canonical casing", () => {
    expect(inferLocaleFromPath("/zh-tw/posts/hi", site)).toBe("zh-TW");
    expect(inferLocaleFromPath("/EN", site)).toBe("en");
  });
  it("falls back to canonical for unknown segments", () => {
    expect(inferLocaleFromPath("/fr/posts/hi", site)).toBe("en");
  });
});

describe("isKnownLocale", () => {
  it("matches case-insensitively", () => {
    expect(isKnownLocale("zh-tw", site)).toBe(true);
    expect(isKnownLocale("ZH-TW", site)).toBe(true);
  });
  it("rejects unknown", () => {
    expect(isKnownLocale("fr", site)).toBe(false);
    expect(isKnownLocale("", site)).toBe(false);
  });
});

describe("siteConfigFromDefaults", () => {
  it("fills canonicalLocale from locales[0]", () => {
    const sc = siteConfigFromDefaults({ locales: ["en", "zh-TW"], brand: "B" });
    expect(sc.canonicalLocale).toBe("en");
    expect(sc.brand).toBe("B");
    expect(sc.title).toBe("B");
  });
  it("returns canonicalLocale=null for zero-locale sites", () => {
    const sc = siteConfigFromDefaults({});
    expect(sc.canonicalLocale).toBeNull();
    expect(sc.locales).toEqual([]);
  });
});

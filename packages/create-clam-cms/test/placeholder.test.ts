import { describe, expect, it } from "vitest";
import { findLeftovers, substitute } from "../src/placeholder.js";

const values = {
  ARCHETYPE: "presence",
  BRAND: "Lab Cafe",
  DESCRIPTION: "Coffee and notes from Taipei.",
  LOCALES: '["zh-TW","en"]',
  CANONICAL_LOCALE: "zh-TW",
  SITE_URL: "https://example.com",
  GITHUB_OWNER: "phsu",
  INSTALL_TIMESTAMP: "2026-05-12T14:03:00Z",
  INSTALL_SUMMARY: "bootstrapped presence site for Lab Cafe in zh-TW/en",
};

describe("substitute", () => {
  it("replaces all known macros", () => {
    const out = substitute(
      "archetype={{ARCHETYPE}}; brand={{BRAND}}; locales={{LOCALES}}",
      values,
    );
    expect(out).toBe(
      'archetype=presence; brand=Lab Cafe; locales=["zh-TW","en"]',
    );
  });

  it("replaces repeated macros at every site", () => {
    const out = substitute("{{BRAND}} :: {{BRAND}}", values);
    expect(out).toBe("Lab Cafe :: Lab Cafe");
  });

  it("leaves unknown macros in place", () => {
    const out = substitute("{{UNKNOWN_THING}} :: {{BRAND}}", values);
    expect(out).toBe("{{UNKNOWN_THING}} :: Lab Cafe");
  });
});

describe("findLeftovers", () => {
  it("returns the macro names still present in the output", () => {
    const out = substitute(
      "site={{SITE_URL}}; mystery={{UNKNOWN_THING}}; flag={{NOT_A_MACRO}}",
      values,
    );
    const found = findLeftovers(out);
    expect(found.sort()).toEqual(["NOT_A_MACRO", "UNKNOWN_THING"]);
  });

  it("returns empty when all macros were substituted", () => {
    const out = substitute("{{BRAND}} :: {{ARCHETYPE}}", values);
    expect(findLeftovers(out)).toEqual([]);
  });
});

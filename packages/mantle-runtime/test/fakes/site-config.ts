import type { SiteConfig, SiteDefaults } from "@aotter/mantle-spec";
import type { SiteConfigRepository } from "../../src/domain/port/SiteConfigRepository.js";

/** Minimal `SiteConfigRepository` for tests. Holds `mediaPurposes` in
 *  memory — tests can hand a custom set or leave it empty to exercise
 *  fail-closed paths. */
export class InMemorySiteConfigRepository implements SiteConfigRepository {
  constructor(private purposes: readonly string[] = []) {}

  async seed(_defaults: SiteDefaults | undefined): Promise<void> {
    /* noop */
  }

  async load(): Promise<SiteConfig> {
    return {
      title: "Test",
      description: "",
      origin: "",
      locales: [],
      canonicalLocale: null,
      brand: "Test",
      media: { purposes: this.purposes },
    };
  }

  async readLocales(): Promise<readonly string[]> {
    return [];
  }

  async readMediaPurposes(): Promise<readonly string[]> {
    return this.purposes;
  }

  setPurposes(purposes: readonly string[]): void {
    this.purposes = purposes;
  }
}

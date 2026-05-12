import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFromExtractedRoot } from "../src/index.js";

let tempRoot: string;

beforeEach(() => {
  tempRoot = mkdtempSync(join(tmpdir(), "create-clam-cms-test-"));
});
afterEach(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function writeFile(path: string, content: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function fixtureExtractedRoot(): string {
  const root = join(tempRoot, "extracted");
  mkdirSync(join(root, "_common", "mantle"), { recursive: true });
  mkdirSync(join(root, "publication", "src"), { recursive: true });
  mkdirSync(join(root, "blank", "src"), { recursive: true });

  writeFile(
    join(root, "_common", "AGENTS.md.template"),
    "# {{BRAND}} ({{ARCHETYPE}})\nPublic site: {{SITE_URL}}\nOwner: {{GITHUB_OWNER}}\n",
  );
  writeFile(
    join(root, "_common", "mantle", "site.md.template"),
    `---
archetype: {{ARCHETYPE}}
brand: {{BRAND}}
locales: {{LOCALES}}
canonical_locale: {{CANONICAL_LOCALE}}
site_url: {{SITE_URL}}
revisions:
  - at: {{INSTALL_TIMESTAMP}}
    by: install
    summary: {{INSTALL_SUMMARY}}
---

body
`,
  );
  writeFile(
    join(root, "_common", ".gitignore.template"),
    "node_modules\n.wrangler\n",
  );

  // publication starter (minimal)
  writeFile(
    join(root, "publication", "package.json"),
    JSON.stringify({ name: "{{BRAND}}", private: true }, null, 2) + "\n",
  );
  writeFile(
    join(root, "publication", "src", "clamConfig.ts"),
    `export const config = { brand: "{{BRAND}}", origin: "{{SITE_URL}}" };\n`,
  );

  // blank starter (minimal)
  writeFile(
    join(root, "blank", "package.json"),
    JSON.stringify({ name: "blank-{{BRAND}}", private: true }, null, 2) + "\n",
  );
  return root;
}

function commonOpts() {
  return {
    projectName: "demo",
    brand: "Lab Cafe",
    description: "Notes from Taipei.",
    locales: ["zh-TW", "en"],
    githubOwner: "phsu",
    summary: "bootstrapped presence site",
    skipInstall: true,
    skipGitInit: true,
  };
}

describe("installFromExtractedRoot", () => {
  it("merges _common/ then archetype dir, with archetype winning on conflict", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out");
    mkdirSync(destination, { recursive: true });

    const notes = installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    expect(notes.starter_source).toBe(
      "AotterClam/clam-cms-starters/publication",
    );
    expect(notes.overlays).toEqual([]);
    expect(existsSync(join(destination, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(destination, "mantle", "site.md"))).toBe(true);
    expect(existsSync(join(destination, "src", "clamConfig.ts"))).toBe(true);

    const agents = readFileSync(join(destination, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Lab Cafe (publication)");
    expect(agents).toContain("Public site: https://example.com");
    expect(agents).toContain("Owner: phsu");

    const mantle = readFileSync(
      join(destination, "mantle", "site.md"),
      "utf8",
    );
    expect(mantle).toContain('locales: ["zh-TW","en"]');
    expect(mantle).toContain("canonical_locale: zh-TW");
    expect(mantle).toMatch(/at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);

    const cfg = readFileSync(join(destination, "src", "clamConfig.ts"), "utf8");
    expect(cfg).toContain('brand: "Lab Cafe"');
  });

  it("blank archetype skips publication-specific files", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-blank");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "blank",
      destination,
      extractedRoot,
    });

    expect(existsSync(join(destination, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(destination, "mantle", "site.md"))).toBe(true);
    expect(existsSync(join(destination, "package.json"))).toBe(true);
    expect(
      existsSync(join(destination, "src", "clamConfig.ts")),
    ).toBe(false);
  });

  it(".template suffix is stripped from final filenames", () => {
    const extractedRoot = fixtureExtractedRoot();
    const destination = join(tempRoot, "out-tpl");
    mkdirSync(destination, { recursive: true });

    installFromExtractedRoot({
      ...commonOpts(),
      archetype: "publication",
      destination,
      extractedRoot,
    });

    expect(existsSync(join(destination, "AGENTS.md.template"))).toBe(false);
    expect(existsSync(join(destination, "AGENTS.md"))).toBe(true);
    expect(
      existsSync(join(destination, "mantle", "site.md.template")),
    ).toBe(false);
    expect(existsSync(join(destination, "mantle", "site.md"))).toBe(true);
    expect(existsSync(join(destination, ".gitignore.template"))).toBe(false);
    expect(existsSync(join(destination, ".gitignore"))).toBe(true);
  });

  it("refuses install if any {{PLACEHOLDER}} remains in templated files", () => {
    const extractedRoot = fixtureExtractedRoot();
    writeFile(
      join(extractedRoot, "publication", "broken.md.template"),
      "this references {{NEVER_SUBSTITUTED}}",
    );
    const destination = join(tempRoot, "out-broken");
    mkdirSync(destination, { recursive: true });

    expect(() =>
      installFromExtractedRoot({
        ...commonOpts(),
        archetype: "publication",
        destination,
        extractedRoot,
      }),
    ).toThrow(/unsubstituted/);
  });
});

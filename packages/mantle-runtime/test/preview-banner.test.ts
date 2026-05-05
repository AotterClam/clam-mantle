import { describe, expect, it } from "vitest";
import { injectPreviewBanner } from "../src/domain/service/PreviewBanner.js";

describe("injectPreviewBanner", () => {
  it("inserts the banner immediately after <body>", () => {
    const html = injectPreviewBanner("<html><body><h1>x</h1></body></html>", "<div>P</div>");
    expect(html).toBe("<html><body><div>P</div><h1>x</h1></body></html>");
  });
  it("preserves attributes on the body tag", () => {
    const html = injectPreviewBanner(
      '<html><body class="dark" data-x="1"><h1>x</h1></body></html>',
      "<div>P</div>",
    );
    expect(html).toContain('<body class="dark" data-x="1"><div>P</div>');
  });
  it("returns input unchanged when no body tag exists", () => {
    const html = injectPreviewBanner("<div>fragment</div>", "<div>P</div>");
    expect(html).toBe("<div>fragment</div>");
  });
});

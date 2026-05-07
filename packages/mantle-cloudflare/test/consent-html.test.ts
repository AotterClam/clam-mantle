import { describe, expect, it } from "vitest";
import { detectConsentLocale, renderConsentHtml } from "../src/oauth/consentHtml.js";

describe("OAuth consent HTML", () => {
  it("detects the same locale set used by starter/admin preferences", () => {
    expect(detectConsentLocale("de-DE,de;q=0.9")).toBe("de");
    expect(detectConsentLocale("es-MX,es;q=0.9")).toBe("es");
    expect(detectConsentLocale("fr-FR,fr;q=0.9")).toBe("fr");
    expect(detectConsentLocale("it-IT,it;q=0.9")).toBe("it");
    expect(detectConsentLocale("ja-JP,ja;q=0.9")).toBe("ja");
    expect(detectConsentLocale("ko-KR,ko;q=0.9")).toBe("ko");
    expect(detectConsentLocale("pt-BR,pt;q=0.9")).toBe("pt-BR");
    expect(detectConsentLocale("ru-RU,ru;q=0.9")).toBe("ru");
    expect(detectConsentLocale("nl-NL,nl;q=0.9")).toBe("nl");
    expect(detectConsentLocale("pl-PL,pl;q=0.9")).toBe("pl");
    expect(detectConsentLocale("tr-TR,tr;q=0.9")).toBe("tr");
    expect(detectConsentLocale("vi-VN,vi;q=0.9")).toBe("vi");
    expect(detectConsentLocale("cs-CZ,cs;q=0.9")).toBe("cs");
    expect(detectConsentLocale("uk-UA,uk;q=0.9")).toBe("uk");
    expect(detectConsentLocale("ar-SA,ar;q=0.9")).toBe("ar");
    expect(detectConsentLocale("he-IL,he;q=0.9")).toBe("he");
    expect(detectConsentLocale("fa-IR,fa;q=0.9")).toBe("fa");
    expect(detectConsentLocale("th-TH,th;q=0.9")).toBe("th");
    expect(detectConsentLocale("zh-CN,zh;q=0.9")).toBe("zh-CN");
    expect(detectConsentLocale("zh-TW,zh;q=0.9")).toBe("zh-TW");
    expect(detectConsentLocale("id-ID,id;q=0.9")).toBe("id");
    expect(detectConsentLocale("en-US,en;q=0.9")).toBe("en");
  });

  it("renders localized consent pages without leaking HTML from client data", () => {
    const html = renderConsentHtml("zh-TW", {
      clientName: "<agent>",
      redirectUri: "https://client.example/cb?x=<bad>",
      scopes: ["mcp:content"],
      oauthRequestJson: JSON.stringify({ clientId: "<agent>" }),
    });

    expect(html).toContain('lang="zh-Hant-TW"');
    expect(html).toContain("授權 MCP 存取");
    expect(html).toContain("&lt;agent&gt;");
    expect(html).not.toContain("<agent>");
  });

  it("renders RTL metadata for RTL consent locales", () => {
    const html = renderConsentHtml("ar", {
      clientName: "Agent",
      redirectUri: "https://client.example/cb",
      scopes: [],
      oauthRequestJson: JSON.stringify({ clientId: "agent" }),
    });

    expect(html).toContain('lang="ar"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("تفويض");
  });
});

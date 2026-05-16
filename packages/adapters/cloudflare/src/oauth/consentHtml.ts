/**
 * OAuth consent UI renderer. Self-contained HTML — no external assets,
 * no framework. Navy-on-cream palette mirrors the admin SPA.
 * Supports zh-TW and en locales.
 */

export interface ConsentModel {
  readonly clientName: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly oauthRequestJson: string;
}

/** Detect consent UI locale from Accept-Language header. */
export function detectConsentLocale(acceptLanguage: string | null): "zh-TW" | "en" {
  if (!acceptLanguage) return "en";
  const lower = acceptLanguage.toLowerCase();
  if (lower.includes("zh-tw") || lower.includes("zh_tw")) return "zh-TW";
  return "en";
}

const STRINGS = {
  en: {
    title: "Authorize · mantle",
    eyebrow: "Authorize MCP access",
    heading: (client: string) => `Allow ${client} to access your CMS?`,
    redirectLabel: "Will redirect to",
    scopesLabel: "Requested scopes",
    approve: "Approve",
    deny: "Deny",
    invalidTitle: "Invalid authorization request",
    invalidBody: "Missing or malformed consent payload. Return to your MCP client and try again.",
  },
  "zh-TW": {
    title: "授權 · mantle",
    eyebrow: "授權 MCP 存取",
    heading: (client: string) => `允許 ${client} 存取您的 CMS？`,
    redirectLabel: "將重新導向至",
    scopesLabel: "請求的授權範圍",
    approve: "同意",
    deny: "拒絕",
    invalidTitle: "無效的授權請求",
    invalidBody: "缺少或格式錯誤的授權資訊，請返回 MCP 客戶端重試。",
  },
} as const;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const CSS = `
  :root{--navy:#1a3062;--navy-light:#4d6aac;--bg:#eef1f8;--surface:rgba(255,255,255,.92);--border:rgba(151,158,175,.30);--muted:#6b7280;--fg:#111827}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;color:var(--fg);background:radial-gradient(ellipse at 20% 20%,rgba(77,106,172,.10) 0%,transparent 55%),radial-gradient(ellipse at 80% 80%,rgba(0,183,199,.07) 0%,transparent 55%),var(--bg)}
  .card{max-width:32rem;width:100%;padding:2rem;border-radius:.75rem;background:var(--surface);border:1px solid var(--border);box-shadow:0 2px 20px rgba(26,48,98,.08),0 1px 4px rgba(26,48,98,.04);backdrop-filter:blur(14px)}
  .eyebrow{font-size:.7rem;text-transform:uppercase;letter-spacing:.18em;font-weight:500;color:var(--muted);margin:0 0 .5rem}
  h1{font-size:1.5rem;line-height:1.3;font-weight:500;margin:0 0 .75rem;letter-spacing:-.02em}
  p{margin:0 0 1rem;font-size:.95rem;line-height:1.55}
  .muted{color:var(--muted);font-size:.875rem}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.8rem;padding:.125rem .4rem;border-radius:.25rem;background:rgba(26,48,98,.06)}
  .scopes{margin:0 0 1.5rem;display:flex;flex-wrap:wrap;gap:.375rem}
  .scope{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;padding:.25rem .5rem;border-radius:.25rem;background:rgba(26,48,98,.06)}
  form{display:flex;gap:.75rem}
  button{flex:1;padding:.625rem 1rem;border:0;border-radius:.5rem;font:inherit;font-weight:500;cursor:pointer;transition:opacity .15s,background .15s}
  button[value="approve"]{background:var(--navy);color:#fff}
  button[value="approve"]:hover{opacity:.9}
  button[value="deny"]{background:rgba(26,48,98,.08);color:var(--fg)}
  button[value="deny"]:hover{background:rgba(26,48,98,.14)}
`.trim();

export function renderConsentHtml(locale: "zh-TW" | "en", model: ConsentModel | null): string {
  const t = STRINGS[locale];
  const lang = locale === "zh-TW" ? "zh-Hant-TW" : "en";
  const head = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${t.title}</title><style>${CSS}</style></head><body><div class="card">`;
  const tail = `</div></body></html>`;

  if (!model) {
    return `${head}<p class="eyebrow">${t.eyebrow}</p><h1>${t.invalidTitle}</h1><p class="muted">${t.invalidBody}</p>${tail}`;
  }

  const scopesBlock =
    model.scopes.length > 0
      ? `<p class="eyebrow">${t.scopesLabel}</p><div class="scopes">${model.scopes.map((s) => `<span class="scope">${escapeHtml(s)}</span>`).join("")}</div>`
      : "";

  return (
    `${head}` +
    `<p class="eyebrow">${t.eyebrow}</p>` +
    `<h1>${t.heading(escapeHtml(model.clientName))}</h1>` +
    `<p class="muted">${t.redirectLabel} <code>${escapeHtml(model.redirectUri)}</code></p>` +
    `${scopesBlock}` +
    `<form method="post" action="/oauth/authorize">` +
    `<input type="hidden" name="oauth_request" value="${escapeHtml(model.oauthRequestJson)}"/>` +
    `<button type="submit" name="decision" value="approve">${t.approve}</button>` +
    `<button type="submit" name="decision" value="deny">${t.deny}</button>` +
    `</form>` +
    `${tail}`
  );
}

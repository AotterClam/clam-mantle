/**
 * OAuth consent UI renderer. Self-contained HTML — no external assets,
 * no framework. This is a system page, so its locale set follows the
 * starter/admin preference languages rather than the site's content locales.
 */

export interface ConsentModel {
  readonly clientName: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
  readonly oauthRequestJson: string;
}

const CONSENT_LOCALES = [
  { value: "en", htmlLang: "en", direction: "ltr" },
  { value: "de", htmlLang: "de", direction: "ltr" },
  { value: "es", htmlLang: "es", direction: "ltr" },
  { value: "fr", htmlLang: "fr", direction: "ltr" },
  { value: "it", htmlLang: "it", direction: "ltr" },
  { value: "ja", htmlLang: "ja", direction: "ltr" },
  { value: "ko", htmlLang: "ko", direction: "ltr" },
  { value: "pt-BR", htmlLang: "pt-BR", direction: "ltr" },
  { value: "ru", htmlLang: "ru", direction: "ltr" },
  { value: "zh-CN", htmlLang: "zh-Hans-CN", direction: "ltr" },
  { value: "zh-TW", htmlLang: "zh-Hant-TW", direction: "ltr" },
  { value: "id", htmlLang: "id", direction: "ltr" },
  { value: "nl", htmlLang: "nl", direction: "ltr" },
  { value: "pl", htmlLang: "pl", direction: "ltr" },
  { value: "tr", htmlLang: "tr", direction: "ltr" },
  { value: "vi", htmlLang: "vi", direction: "ltr" },
  { value: "cs", htmlLang: "cs", direction: "ltr" },
  { value: "uk", htmlLang: "uk", direction: "ltr" },
  { value: "ar", htmlLang: "ar", direction: "rtl" },
  { value: "he", htmlLang: "he", direction: "rtl" },
  { value: "fa", htmlLang: "fa", direction: "rtl" },
  { value: "th", htmlLang: "th", direction: "ltr" },
] as const;

export type ConsentLocale = (typeof CONSENT_LOCALES)[number]["value"];

type ConsentStrings = {
  title: string;
  eyebrow: string;
  heading: (client: string) => string;
  redirectLabel: string;
  scopesLabel: string;
  approve: string;
  deny: string;
  invalidTitle: string;
  invalidBody: string;
};

/** Detect consent UI locale from Accept-Language header. */
export function detectConsentLocale(acceptLanguage: string | null): ConsentLocale {
  if (!acceptLanguage) return "en";
  const tokens = acceptLanguage
    .split(",")
    .map((part) => part.trim().split(";")[0]?.toLowerCase())
    .filter((part): part is string => Boolean(part));

  for (const token of tokens) {
    const normalized = normalizeConsentLocale(token);
    if (normalized) return normalized;
  }
  return "en";
}

const STRINGS: Record<ConsentLocale, ConsentStrings> = {
  en: {
    title: "Authorize · mantle",
    eyebrow: "Authorize MCP access",
    heading: (client) => `Allow ${client} to access your CMS?`,
    redirectLabel: "Will redirect to",
    scopesLabel: "Requested scopes",
    approve: "Approve",
    deny: "Deny",
    invalidTitle: "Invalid authorization request",
    invalidBody: "Missing or malformed consent payload. Return to your MCP client and try again.",
  },
  de: {
    title: "Autorisieren · mantle",
    eyebrow: "MCP-Zugriff autorisieren",
    heading: (client) => `${client} den Zugriff auf dein CMS erlauben?`,
    redirectLabel: "Weiterleitung an",
    scopesLabel: "Angeforderte Berechtigungen",
    approve: "Erlauben",
    deny: "Ablehnen",
    invalidTitle: "Ungültige Autorisierungsanfrage",
    invalidBody: "Fehlende oder fehlerhafte Consent-Daten. Kehre zum MCP-Client zurück und versuche es erneut.",
  },
  es: {
    title: "Autorizar · mantle",
    eyebrow: "Autorizar acceso MCP",
    heading: (client) => `¿Permitir que ${client} acceda a tu CMS?`,
    redirectLabel: "Redirigirá a",
    scopesLabel: "Permisos solicitados",
    approve: "Autorizar",
    deny: "Denegar",
    invalidTitle: "Solicitud de autorización inválida",
    invalidBody: "Falta el consentimiento o tiene formato incorrecto. Vuelve al cliente MCP e inténtalo otra vez.",
  },
  fr: {
    title: "Autoriser · mantle",
    eyebrow: "Autoriser l'accès MCP",
    heading: (client) => `Autoriser ${client} à accéder à votre CMS ?`,
    redirectLabel: "Redirection vers",
    scopesLabel: "Portées demandées",
    approve: "Autoriser",
    deny: "Refuser",
    invalidTitle: "Requête d'autorisation invalide",
    invalidBody: "Consentement manquant ou mal formé. Retournez au client MCP et réessayez.",
  },
  it: {
    title: "Autorizza · mantle",
    eyebrow: "Autorizza accesso MCP",
    heading: (client) => `Consentire a ${client} di accedere al tuo CMS?`,
    redirectLabel: "Reindirizzerà a",
    scopesLabel: "Permessi richiesti",
    approve: "Autorizza",
    deny: "Nega",
    invalidTitle: "Richiesta di autorizzazione non valida",
    invalidBody: "Payload di consenso mancante o non valido. Torna al client MCP e riprova.",
  },
  ja: {
    title: "承認 · mantle",
    eyebrow: "MCP アクセスを承認",
    heading: (client) => `${client} に CMS へのアクセスを許可しますか？`,
    redirectLabel: "リダイレクト先",
    scopesLabel: "要求されたスコープ",
    approve: "許可",
    deny: "拒否",
    invalidTitle: "無効な承認リクエスト",
    invalidBody: "Consent payload がないか形式が正しくありません。MCP クライアントに戻って再試行してください。",
  },
  ko: {
    title: "승인 · mantle",
    eyebrow: "MCP 접근 승인",
    heading: (client) => `${client}에게 CMS 접근을 허용할까요?`,
    redirectLabel: "리디렉션 대상",
    scopesLabel: "요청된 범위",
    approve: "승인",
    deny: "거부",
    invalidTitle: "잘못된 승인 요청",
    invalidBody: "동의 payload가 없거나 형식이 잘못되었습니다. MCP 클라이언트로 돌아가 다시 시도하세요.",
  },
  "pt-BR": {
    title: "Autorizar · mantle",
    eyebrow: "Autorizar acesso MCP",
    heading: (client) => `Permitir que ${client} acesse seu CMS?`,
    redirectLabel: "Redirecionará para",
    scopesLabel: "Escopos solicitados",
    approve: "Autorizar",
    deny: "Negar",
    invalidTitle: "Solicitação de autorização inválida",
    invalidBody: "Payload de consentimento ausente ou malformado. Volte ao cliente MCP e tente novamente.",
  },
  ru: {
    title: "Авторизация · mantle",
    eyebrow: "Разрешить доступ MCP",
    heading: (client) => `Разрешить ${client} доступ к вашему CMS?`,
    redirectLabel: "Перенаправление на",
    scopesLabel: "Запрошенные права",
    approve: "Разрешить",
    deny: "Отклонить",
    invalidTitle: "Недействительный запрос авторизации",
    invalidBody: "Отсутствуют или некорректны данные consent. Вернитесь в MCP-клиент и попробуйте снова.",
  },
  "zh-CN": {
    title: "授权 · mantle",
    eyebrow: "授权 MCP 访问",
    heading: (client) => `允许 ${client} 访问你的 CMS？`,
    redirectLabel: "将重定向至",
    scopesLabel: "请求的授权范围",
    approve: "同意",
    deny: "拒绝",
    invalidTitle: "无效的授权请求",
    invalidBody: "缺少或格式错误的授权信息，请返回 MCP 客户端重试。",
  },
  "zh-TW": {
    title: "授權 · mantle",
    eyebrow: "授權 MCP 存取",
    heading: (client) => `允許 ${client} 存取你的 CMS？`,
    redirectLabel: "將重新導向至",
    scopesLabel: "請求的授權範圍",
    approve: "同意",
    deny: "拒絕",
    invalidTitle: "無效的授權請求",
    invalidBody: "缺少或格式錯誤的授權資訊，請返回 MCP client 重試。",
  },
  id: {
    title: "Otorisasi · mantle",
    eyebrow: "Otorisasi akses MCP",
    heading: (client) => `Izinkan ${client} mengakses CMS Anda?`,
    redirectLabel: "Akan mengalihkan ke",
    scopesLabel: "Scope yang diminta",
    approve: "Izinkan",
    deny: "Tolak",
    invalidTitle: "Permintaan otorisasi tidak valid",
    invalidBody: "Payload persetujuan hilang atau salah format. Kembali ke client MCP dan coba lagi.",
  },
  nl: {
    title: "Autoriseren · mantle",
    eyebrow: "MCP-toegang autoriseren",
    heading: (client) => `${client} toegang geven tot je CMS?`,
    redirectLabel: "Redirect naar",
    scopesLabel: "Aangevraagde scopes",
    approve: "Toestaan",
    deny: "Weigeren",
    invalidTitle: "Ongeldig autorisatieverzoek",
    invalidBody: "Consent-payload ontbreekt of is ongeldig. Ga terug naar je MCP-client en probeer opnieuw.",
  },
  pl: {
    title: "Autoryzuj · mantle",
    eyebrow: "Autoryzuj dostęp MCP",
    heading: (client) => `Zezwolić ${client} na dostęp do CMS?`,
    redirectLabel: "Przekieruje do",
    scopesLabel: "Żądane zakresy",
    approve: "Zezwól",
    deny: "Odmów",
    invalidTitle: "Nieprawidłowe żądanie autoryzacji",
    invalidBody: "Brak lub nieprawidłowy payload zgody. Wróć do klienta MCP i spróbuj ponownie.",
  },
  tr: {
    title: "Yetkilendir · mantle",
    eyebrow: "MCP erişimini yetkilendir",
    heading: (client) => `${client} CMS'inize erişsin mi?`,
    redirectLabel: "Şuraya yönlendirecek",
    scopesLabel: "İstenen kapsamlar",
    approve: "İzin ver",
    deny: "Reddet",
    invalidTitle: "Geçersiz yetkilendirme isteği",
    invalidBody: "Onay payload'ı eksik veya hatalı. MCP istemcisine dönüp tekrar deneyin.",
  },
  vi: {
    title: "Ủy quyền · mantle",
    eyebrow: "Ủy quyền truy cập MCP",
    heading: (client) => `Cho phép ${client} truy cập CMS của bạn?`,
    redirectLabel: "Sẽ chuyển hướng đến",
    scopesLabel: "Scope được yêu cầu",
    approve: "Cho phép",
    deny: "Từ chối",
    invalidTitle: "Yêu cầu ủy quyền không hợp lệ",
    invalidBody: "Payload đồng ý bị thiếu hoặc sai định dạng. Quay lại client MCP và thử lại.",
  },
  cs: {
    title: "Autorizovat · mantle",
    eyebrow: "Autorizovat MCP přístup",
    heading: (client) => `Povolit ${client} přístup k vašemu CMS?`,
    redirectLabel: "Přesměruje na",
    scopesLabel: "Požadované rozsahy",
    approve: "Povolit",
    deny: "Odmítnout",
    invalidTitle: "Neplatný autorizační požadavek",
    invalidBody: "Consent payload chybí nebo má chybný formát. Vraťte se do MCP klienta a zkuste to znovu.",
  },
  uk: {
    title: "Авторизація · mantle",
    eyebrow: "Дозволити доступ MCP",
    heading: (client) => `Дозволити ${client} доступ до вашої CMS?`,
    redirectLabel: "Перенаправить до",
    scopesLabel: "Запитані права",
    approve: "Дозволити",
    deny: "Відхилити",
    invalidTitle: "Недійсний запит авторизації",
    invalidBody: "Payload згоди відсутній або має неправильний формат. Поверніться до MCP-клієнта й спробуйте ще раз.",
  },
  ar: {
    title: "تفويض · mantle",
    eyebrow: "تفويض وصول MCP",
    heading: (client) => `هل تسمح لـ ${client} بالوصول إلى CMS؟`,
    redirectLabel: "سيعيد التوجيه إلى",
    scopesLabel: "النطاقات المطلوبة",
    approve: "سماح",
    deny: "رفض",
    invalidTitle: "طلب التفويض غير صالح",
    invalidBody: "بيانات الموافقة مفقودة أو غير صحيحة. ارجع إلى عميل MCP وحاول مرة أخرى.",
  },
  he: {
    title: "אישור · mantle",
    eyebrow: "אישור גישת MCP",
    heading: (client) => `לאפשר ל-${client} לגשת ל-CMS שלך?`,
    redirectLabel: "יפנה אל",
    scopesLabel: "הרשאות מבוקשות",
    approve: "אשר",
    deny: "דחה",
    invalidTitle: "בקשת הרשאה לא תקינה",
    invalidBody: "Payload ההסכמה חסר או שגוי. חזור ללקוח MCP ונסה שוב.",
  },
  fa: {
    title: "مجوزدهی · mantle",
    eyebrow: "مجوز دسترسی MCP",
    heading: (client) => `به ${client} اجازه دسترسی به CMS را می‌دهید؟`,
    redirectLabel: "هدایت می‌شود به",
    scopesLabel: "دسترسی‌های درخواستی",
    approve: "اجازه دادن",
    deny: "رد کردن",
    invalidTitle: "درخواست مجوز نامعتبر است",
    invalidBody: "Payload رضایت وجود ندارد یا نامعتبر است. به کلاینت MCP برگردید و دوباره تلاش کنید.",
  },
  th: {
    title: "อนุญาต · mantle",
    eyebrow: "อนุญาตการเข้าถึง MCP",
    heading: (client) => `อนุญาตให้ ${client} เข้าถึง CMS ของคุณหรือไม่?`,
    redirectLabel: "จะเปลี่ยนเส้นทางไปยัง",
    scopesLabel: "Scope ที่ร้องขอ",
    approve: "อนุญาต",
    deny: "ปฏิเสธ",
    invalidTitle: "คำขออนุญาตไม่ถูกต้อง",
    invalidBody: "Payload การยินยอมหายไปหรือรูปแบบไม่ถูกต้อง กลับไปที่ MCP client แล้วลองอีกครั้ง",
  },
};

function normalizeConsentLocale(value: string): ConsentLocale | null {
  if (value === "zh-tw" || value === "zh-hant" || value.startsWith("zh-hant")) return "zh-TW";
  if (value === "zh-cn" || value === "zh-hans" || value.startsWith("zh-hans")) return "zh-CN";
  if (value.startsWith("pt-br") || value === "pt") return "pt-BR";
  const base = value.split("-")[0];
  if (base === "ar") return "ar";
  if (base === "cs") return "cs";
  if (base === "de") return "de";
  if (base === "es") return "es";
  if (base === "fa") return "fa";
  if (base === "fr") return "fr";
  if (base === "he" || base === "iw") return "he";
  if (base === "id") return "id";
  if (base === "it") return "it";
  if (base === "ja") return "ja";
  if (base === "ko") return "ko";
  if (base === "nl") return "nl";
  if (base === "pl") return "pl";
  if (base === "pt") return "pt-BR";
  if (base === "ru") return "ru";
  if (base === "th") return "th";
  if (base === "tr") return "tr";
  if (base === "uk") return "uk";
  if (base === "vi") return "vi";
  if (base === "zh") return "zh-TW";
  if (base === "en") return "en";
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const AOTTER_MARK = `<svg viewBox="0 0 128 128" class="brand-mark" aria-hidden="true"><path fill="currentColor" d="M111.76,52.77c-4.05-6.75-13.09-19.07-28.16-25.67-.97-.43-9.36-4.13-19.6-4.13s-18.63,3.7-19.6,4.13c-15.08,6.59-24.12,18.91-28.16,25.67-6.57,10.92-6.56,17.8-6.03,20.94,1.45,8.52,35.82,16.09,33.19,19.03-3.96,4.86-1.12,12.29,7.1,12.29h26.99c8.22,0,11.06-7.44,7.1-12.29-2.63-2.94,31.74-10.5,33.19-19.03.53-3.14.54-10.01-6.03-20.94ZM101.76,64.08c-8.92,11.77-25.79,25.56-25.93,25.68-1.1,1.23-.4,2.67.21,3.94.72,1.5,1.15,2.54.53,3.38-.47.64-.75.83-1.22.83h-22.95c-.46,0-.75-.2-1.22-.83-.61-.84-.19-1.88.53-3.38.61-1.27,1.31-2.71.21-3.94-.15-.11-15.88-13.29-24.81-25.07-.46-.6-.61-1.51-.42-2.54.36-2.03,1.85-4.15,3.8-5.4,1.28-.82,2.75-1.22,4.12-1.22,1.71,0,3.25.63,4.03,1.83,1.16,1.8,14.73,23.3,16.48,26.48,1.3,2.35,2.68,3.27,4.08,2.7,1.4-.56,1-3.17-.57-12.12-1.28-7.28-3.03-22.92-3.03-31.19,0-2.17,2.62-4.45,6.45-5.08v-.03c.57-.08,3.04-.08,3.62,0v.03c3.84.63,6.45,2.91,6.45,5.08,0,8.27-1.75,23.91-3.03,31.19-1.57,8.95-1.96,11.55-.57,12.12,1.4.57,2.77-.34,4.08-2.7,1.75-3.17,16.45-25.28,17.61-27.09.77-1.2,2.32-1.83,4.03-1.83,1.37,0,2.84.4,4.12,1.22,1.95,1.25,3.45,3.38,3.8,5.4.18,1.04.03,1.94-.42,2.54Z"/></svg>`;

const CSS = `
  :root{--background:#eef1f8;--foreground:#111827;--card:rgba(255,255,255,.82);--card-strong:rgba(255,255,255,.94);--border:rgba(151,158,175,.30);--muted:#667085;--primary:#1a3062;--primary-foreground:#fff;--accent:#dce6f8;--shadow:rgba(26,48,98,.14);--danger:#b42318}
  @media (prefers-color-scheme: dark){:root{--background:#071127;--foreground:#eef4ff;--card:rgba(13,27,55,.72);--card-strong:rgba(17,34,68,.88);--border:rgba(169,186,222,.22);--muted:#a8b3cf;--primary:#7da2ff;--primary-foreground:#071127;--accent:rgba(125,162,255,.14);--shadow:rgba(0,0,0,.36);--danger:#ff9b92}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--foreground);background:radial-gradient(ellipse at 12% 16%,rgba(77,106,172,.22) 0%,transparent 48%),radial-gradient(ellipse at 86% 78%,rgba(0,183,199,.14) 0%,transparent 50%),linear-gradient(135deg,var(--background),color-mix(in srgb,var(--background) 78%,#4d6aac))}
  .card{position:relative;max-width:34rem;width:100%;padding:2rem;border-radius:1.25rem;background:linear-gradient(145deg,var(--card-strong),var(--card));border:1px solid var(--border);box-shadow:0 24px 70px var(--shadow),0 2px 12px rgba(26,48,98,.10);backdrop-filter:blur(18px)}
  .card:before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(135deg,rgba(255,255,255,.38),transparent 35%)}
  .brand-mark{position:relative;inline-size:1.5rem;block-size:1.5rem;color:var(--primary);margin-block-end:1rem}
  .eyebrow{font-size:.68rem;text-transform:uppercase;letter-spacing:.18em;font-weight:650;color:var(--muted);margin:0 0 .65rem}
  h1{font-size:clamp(1.45rem,4vw,2rem);line-height:1.15;font-weight:650;margin:0 0 .85rem;letter-spacing:-.035em}
  p{margin:0 0 1rem;font-size:.95rem;line-height:1.6}
  .muted{color:var(--muted);font-size:.9rem}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.78rem;padding:.18rem .45rem;border-radius:.45rem;background:var(--accent);color:var(--foreground);overflow-wrap:anywhere}
  .scopes{margin:0 0 1.5rem;display:flex;flex-wrap:wrap;gap:.45rem}
  .scope{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.75rem;padding:.3rem .55rem;border-radius:999px;background:var(--accent);color:var(--foreground)}
  form{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-top:.35rem}
  button{min-height:2.55rem;border-radius:.75rem;font:inherit;font-weight:650;cursor:pointer;transition:transform .12s ease,background .15s ease,border-color .15s ease}
  button:hover{transform:translateY(-1px)}
  button[value="approve"]{border:1px solid var(--primary);background:var(--primary);color:var(--primary-foreground)}
  button[value="deny"]{border:1px solid var(--border);background:transparent;color:var(--foreground)}
  button[value="deny"]:hover{background:color-mix(in srgb,var(--danger) 10%,transparent);border-color:color-mix(in srgb,var(--danger) 45%,var(--border));color:var(--danger)}
  @media (max-width:480px){.card{padding:1.35rem}form{grid-template-columns:1fr}}
`.trim();

function wrapCard(locale: ConsentLocale, inner: string): string {
  const strings = STRINGS[locale];
  const metadata = CONSENT_LOCALES.find((l) => l.value === locale);
  const htmlLang = metadata?.htmlLang ?? "en";
  const direction = metadata?.direction ?? "ltr";
  return `<!doctype html><html lang="${htmlLang}" dir="${direction}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${strings.title}</title><style>${CSS}</style></head><body><main class="card">${AOTTER_MARK}${inner}</main></body></html>`;
}

export function renderConsentHtml(
  locale: ConsentLocale,
  model: ConsentModel | null,
): string {
  const strings = STRINGS[locale];

  if (!model) {
    return wrapCard(
      locale,
      `<p class="eyebrow">${strings.eyebrow}</p><h1>${strings.invalidTitle}</h1><p class="muted">${strings.invalidBody}</p>`,
    );
  }

  const scopesBlock =
    model.scopes.length > 0
      ? `<p class="eyebrow">${strings.scopesLabel}</p><div class="scopes">${model.scopes.map((s) => `<span class="scope">${escapeHtml(s)}</span>`).join("")}</div>`
      : "";

  return wrapCard(
    locale,
    `<p class="eyebrow">${strings.eyebrow}</p>` +
      `<h1>${strings.heading(escapeHtml(model.clientName))}</h1>` +
      `<p class="muted">${strings.redirectLabel} <code>${escapeHtml(model.redirectUri)}</code></p>` +
      `${scopesBlock}` +
      `<form method="post" action="/oauth/authorize">` +
      `<input type="hidden" name="oauth_request" value="${escapeHtml(model.oauthRequestJson)}"/>` +
      `<button type="submit" name="decision" value="approve">${strings.approve}</button>` +
      `<button type="submit" name="decision" value="deny">${strings.deny}</button>` +
      `</form>`,
  );
}

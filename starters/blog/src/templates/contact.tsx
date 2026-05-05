/** @jsxImportSource hono/jsx */
import { html, raw } from "hono/html";
import { marked } from "marked";
import type { SiteConfig } from "@aotter/mantle-spec";
import { Layout } from "./components/Layout.js";
import { pickCopy } from "./utils.js";

const markedOptions = { gfm: true, breaks: false } as const;

const COPY = {
  en: {
    title: "Contact",
    nameLabel: "Name",
    emailLabel: "Email",
    messageLabel: "Message",
    send: "Send",
    sending: "Sending…",
    success: "Thanks — your message landed.",
    fallback: "Could not send: ",
    captcha: "Anti-bot check",
  },
  "zh-tw": {
    title: "聯絡",
    nameLabel: "姓名",
    emailLabel: "電子信箱",
    messageLabel: "訊息",
    send: "送出",
    sending: "送出中…",
    success: "感謝你 — 訊息已送達。",
    fallback: "送出失敗：",
    captcha: "防機器人驗證",
  },
};

export interface ContactContext {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly page: { title: string; intro?: string; body: string };
  readonly turnstileSiteKey: string;
}

export function contactTemplate(ctx: ContactContext): string {
  const { site, locale, page, turnstileSiteKey } = ctx;
  const copy = pickCopy(COPY, locale);
  const title = page.title || copy.title;
  const bodyHtml = page.body ? (marked.parse(page.body, markedOptions) as string) : "";
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${title} — ${site.brand}`}
      description={page.intro ?? site.description}
      current="contact"
    >
      <article>
        <header class="post-meta">
          <h1>{title}</h1>
          {page.intro ? <p class="meta">{page.intro}</p> : null}
        </header>
        {bodyHtml ? <div class="post-body">{raw(bodyHtml)}</div> : null}

        <form class="contact-form" id="contact-form" novalidate>
          <label class="contact-label">
            <span>{copy.nameLabel}</span>
            <input name="name" type="text" required autocomplete="name" />
          </label>
          <label class="contact-label">
            <span>{copy.emailLabel}</span>
            <input name="email" type="email" required autocomplete="email" />
          </label>
          <label class="contact-label">
            <span>{copy.messageLabel}</span>
            <textarea name="message" rows={6} required></textarea>
          </label>
          <div class="contact-captcha">
            <span class="contact-captcha-label">{copy.captcha}</span>
            <div
              class="cf-turnstile"
              data-sitekey={turnstileSiteKey}
              data-theme="auto"
            ></div>
          </div>
          <button type="submit" class="contact-submit">
            <span data-state="idle">{copy.send}</span>
            <span data-state="sending" hidden>
              {copy.sending}
            </span>
          </button>
          <p class="contact-status" role="status" aria-live="polite"></p>
        </form>
      </article>
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
      {html`<script>
${raw(buildContactRuntimeJs(copy))}
</script>`}
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

function buildContactRuntimeJs(copy: (typeof COPY)["en"]): string {
  const successMsg = JSON.stringify(copy.success);
  const fallbackMsg = JSON.stringify(copy.fallback);
  return `
(function(){
  var form = document.getElementById('contact-form');
  if(!form) return;
  var status = form.querySelector('.contact-status');
  var submit = form.querySelector('button[type="submit"]');
  var idleLabel = submit.querySelector('[data-state="idle"]');
  var sendingLabel = submit.querySelector('[data-state="sending"]');
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    status.textContent = '';
    status.removeAttribute('data-error');
    var fd = new FormData(form);
    var token = fd.get('cf-turnstile-response') || '';
    if(!token){
      status.textContent = ${fallbackMsg} + 'captcha';
      status.setAttribute('data-error', '1');
      return;
    }
    submit.disabled = true;
    idleLabel.hidden = true;
    sendingLabel.hidden = false;
    try {
      var res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          message: fd.get('message'),
          turnstileToken: token,
        }),
      });
      var data = await res.json().catch(function(){ return {}; });
      if(res.ok && data && data.ok){
        status.textContent = ${successMsg};
        form.reset();
        if(window.turnstile){ window.turnstile.reset(); }
      } else {
        var msg = (data && data.diagnostic && data.diagnostic.message) || ('HTTP ' + res.status);
        status.textContent = ${fallbackMsg} + msg;
        status.setAttribute('data-error', '1');
      }
    } catch(err){
      status.textContent = ${fallbackMsg} + (err && err.message ? err.message : 'network');
      status.setAttribute('data-error', '1');
    } finally {
      submit.disabled = false;
      idleLabel.hidden = false;
      sendingLabel.hidden = true;
    }
  });
})();
`;
}

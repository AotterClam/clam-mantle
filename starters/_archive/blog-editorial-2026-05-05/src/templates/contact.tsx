/** @jsxImportSource hono/jsx */
import { html, raw } from "hono/html";
import { marked } from "marked";
import type { SiteConfig } from "@aotter/mantle-spec";
import { Layout } from "./components/Layout.js";
import { bundleFor } from "../i18n/index.js";

const markedOptions = { gfm: true, breaks: false } as const;

export interface ContactContext {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly page: { title: string; intro?: string; body: string };
  readonly turnstileSiteKey: string;
}

export function contactTemplate(ctx: ContactContext): string {
  const { site, locale, page, turnstileSiteKey } = ctx;
  const t = bundleFor(locale);
  const title = page.title || t.contact.title;
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
            <span>{t.contact.nameLabel}</span>
            <input name="name" type="text" required autocomplete="name" />
          </label>
          <label class="contact-label">
            <span>{t.contact.emailLabel}</span>
            <input name="email" type="email" required autocomplete="email" />
          </label>
          <label class="contact-label">
            <span>{t.contact.messageLabel}</span>
            <textarea name="message" rows={6} required></textarea>
          </label>
          <div class="contact-captcha">
            <span class="contact-captcha-label">{t.contact.captchaLabel}</span>
            <div
              id="turnstile-mount"
              data-sitekey={turnstileSiteKey}
            ></div>
          </div>
          <button type="submit" class="contact-submit">
            <span data-state="idle">{t.contact.send}</span>
            <span data-state="sending" hidden>
              {t.contact.sending}
            </span>
          </button>
          <p class="contact-status" role="status" aria-live="polite"></p>
        </form>
      </article>
      <script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__mantleTurnstileReady&render=explicit"
        async
        defer
      ></script>
      {html`<script>
${raw(buildContactRuntimeJs(t))}
</script>`}
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

function buildContactRuntimeJs(t: ReturnType<typeof bundleFor>): string {
  const successMsg = JSON.stringify(t.contact.success);
  const fallbackMsg = JSON.stringify(t.contact.fallbackPrefix);
  return `
(function(){
  var form = document.getElementById('contact-form');
  if(!form) return;
  var status = form.querySelector('.contact-status');
  var submit = form.querySelector('button[type="submit"]');
  var idleLabel = submit.querySelector('[data-state="idle"]');
  var sendingLabel = submit.querySelector('[data-state="sending"]');
  var mount = document.getElementById('turnstile-mount');
  var sitekey = mount && mount.getAttribute('data-sitekey');
  var widgetId = null;

  function pageTheme(){
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
  function renderWidget(){
    if(!mount || !window.turnstile) return;
    if(widgetId !== null){ window.turnstile.remove(widgetId); }
    widgetId = window.turnstile.render(mount, {
      sitekey: sitekey,
      theme: pageTheme(),
    });
  }
  // Turnstile script calls __mantleTurnstileReady() on load (?onload=...).
  window.__mantleTurnstileReady = renderWidget;
  // If the script loaded before this runtime ran (cached), render now.
  if(window.turnstile && widgetId === null){ renderWidget(); }
  document.addEventListener('mantle:theme', renderWidget);

  function tokenFromWidget(){
    if(window.turnstile && widgetId !== null){
      try { return window.turnstile.getResponse(widgetId) || ''; } catch(_){}
    }
    var fd = new FormData(form);
    return fd.get('cf-turnstile-response') || '';
  }

  form.addEventListener('submit', async function(e){
    e.preventDefault();
    status.textContent = '';
    status.removeAttribute('data-error');
    var token = tokenFromWidget();
    if(!token){
      status.textContent = ${fallbackMsg} + 'captcha';
      status.setAttribute('data-error', '1');
      return;
    }
    var fd = new FormData(form);
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
        if(window.turnstile && widgetId !== null){ window.turnstile.reset(widgetId); }
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

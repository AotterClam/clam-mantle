export const SITE_CSS = `
:root {
  --paper: #f6f1e7;
  --ink: #1a1814;
  --rule: #d4c8b3;
  --rule-strong: #3d342a;
  --mute: #7a6d5e;
  --accent: #a3331f;
  --accent-soft: #c9614a;
  --selection: #f0d6a3;

  --font-display: "Fraunces", "Noto Serif TC", "Source Serif 4", Georgia, serif;
  --font-body: "Source Serif 4", "Noto Serif TC", Georgia, serif;
  --font-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --measure: 38rem;
  --gutter: clamp(1.25rem, 4vw, 3rem);
}

[data-theme="dark"] {
  --paper: #1a1814;
  --ink: #f1ebdf;
  --rule: #3d342a;
  --rule-strong: #5a4d40;
  --mute: #9a8d7e;
  --accent: #e6594a;
  --accent-soft: #c9614a;
  --selection: #4a3520;
}

* { box-sizing: border-box; }

html {
  background: var(--paper);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 18px;
  line-height: 1.65;
  font-feature-settings: "kern", "liga", "onum";
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  transition: background-color 200ms ease, color 200ms ease;
}

body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

::selection { background: var(--selection); color: var(--ink); }

a { color: inherit; text-underline-offset: 0.18em; text-decoration-thickness: 0.06em; }
a:hover { color: var(--accent); }

p { margin: 0 0 1.1em 0; }
p + p { text-indent: 1.5em; }

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 500;
  font-variation-settings: "opsz" 36, "SOFT" 30;
  letter-spacing: -0.012em;
  line-height: 1.15;
  margin: 0 0 0.5em 0;
}
h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); font-variation-settings: "opsz" 96, "SOFT" 30; }
h2 { font-size: clamp(1.6rem, 3.4vw, 2.2rem); }
h3 { font-size: clamp(1.25rem, 2.4vw, 1.5rem); }

small, time, .meta {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--mute);
  text-transform: uppercase;
}

hr {
  border: none;
  border-top: 1px solid var(--rule);
  margin: 2.5rem 0;
}

img { max-width: 100%; height: auto; display: block; }

/* — Header — */

.site-header {
  border-bottom: 1px solid var(--rule);
  padding: 1.1rem var(--gutter);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: saturate(140%) blur(10px);
  -webkit-backdrop-filter: saturate(140%) blur(10px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.site-header .brand {
  font-family: var(--font-display);
  font-weight: 600;
  font-variation-settings: "opsz" 36, "SOFT" 30;
  font-size: 1.4rem;
  letter-spacing: -0.005em;
  text-decoration: none;
}
.site-header .brand:hover { color: var(--accent); }
.site-header .brand .dot { color: var(--accent); margin: 0 0.18em; }

.site-nav {
  display: flex;
  align-items: baseline;
  gap: 1.4rem;
  flex: 1 1 auto;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.site-nav a {
  text-decoration: none;
  padding: 0.2rem 0;
  border-bottom: 1px solid transparent;
}
.site-nav a:hover { border-bottom-color: var(--accent); }
.site-nav a[aria-current="page"] { border-bottom-color: var(--ink); }

.site-controls {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}

/* — Popover (theme + lang) — */

.popover { position: relative; }
.popover-trigger {
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0.35rem 0.55rem;
  cursor: pointer;
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  line-height: 1;
}
.popover-trigger:hover { border-color: var(--rule); color: var(--accent); }
.popover-trigger[aria-expanded="true"] {
  border-color: var(--rule);
  background: color-mix(in srgb, var(--rule) 35%, transparent);
}
.popover-trigger-icon { padding: 0.4rem; }
.popover-trigger-icon svg { display: block; }
.popover-trigger-text .popover-trigger-label { font-weight: 500; }
.popover-trigger > svg:last-child { opacity: 0.55; }

.popover-menu {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 9.5rem;
  background: var(--paper);
  border: 1px solid var(--rule);
  border-radius: 8px;
  padding: 0.3rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--ink) 8%, transparent),
    0 8px 24px color-mix(in srgb, var(--ink) 12%, transparent);
  z-index: 20;
}
.popover-menu[hidden] { display: none; }
[data-theme="dark"] .popover-menu {
  background: color-mix(in srgb, var(--paper) 92%, var(--ink));
  border-color: var(--rule-strong);
}

.popover-item {
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  border: none;
  border-radius: 5px;
  padding: 0.4rem 0.55rem;
  cursor: pointer;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 0.6rem;
  letter-spacing: 0.01em;
  font-size: 0.85rem;
  text-align: left;
  width: 100%;
}
.popover-item:hover {
  background: color-mix(in srgb, var(--rule) 40%, transparent);
}
.popover-item-icon { display: inline-flex; opacity: 0.75; }
.popover-item-label { font-weight: 500; }
.popover-item-check {
  display: inline-flex;
  color: var(--accent);
  visibility: hidden;
}
.popover-item[aria-checked="true"] .popover-item-check { visibility: visible; }
.popover-item[aria-checked="true"] .popover-item-icon { opacity: 1; }

.popover-trigger-label { white-space: nowrap; }

@media (max-width: 720px) {
  .site-header { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  .site-nav { justify-content: flex-start; gap: 1rem; }
  .site-controls { align-self: flex-end; margin-top: -2rem; }
}

/* — Main + article — */

.site-main {
  flex: 1 0 auto;
  padding: clamp(2rem, 6vw, 4rem) var(--gutter);
  /* Tight column — just wider than --measure (38rem) so the editorial
   * single-column layout doesn't leave a dead zone on the right. The
   * recent-posts grid (date 7rem + title 1fr) still fits comfortably. */
  max-width: 48rem;
  width: 100%;
  margin: 0 auto;
}

article { max-width: var(--measure); }
article header.post-meta { margin-bottom: 2rem; }
article header.post-meta time { display: block; margin-bottom: 0.5rem; }
article header.post-meta h1 { margin-bottom: 0.5rem; }

.post-cover { margin: 0 0 2rem 0; border: 1px solid var(--rule); }

.post-body { font-size: 1.05rem; }
.post-body > p:first-of-type::first-letter {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 3.4em;
  line-height: 0.85;
  float: left;
  margin: 0.05em 0.12em -0.05em 0;
  color: var(--accent);
}
.post-body > p:first-of-type { text-indent: 0; }
.post-body p { text-indent: 0; }
.post-body p + p { text-indent: 1.5em; }
.post-body h2 { margin-top: 2.2rem; }
.post-body h3 { margin-top: 1.8rem; }
.post-body blockquote {
  margin: 1.5rem 0;
  padding: 0 0 0 1.2rem;
  border-left: 2px solid var(--accent);
  color: var(--mute);
  font-style: italic;
}
.post-body code {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--rule);
  padding: 0.05em 0.35em;
  border-radius: 2px;
}
[data-theme="dark"] .post-body code { background: var(--rule); }
.post-body pre {
  font-family: var(--font-mono);
  font-size: 0.88em;
  background: var(--rule);
  padding: 1rem 1.2rem;
  overflow-x: auto;
  border-radius: 2px;
  border-left: 2px solid var(--accent);
}
.post-body pre code { background: none; padding: 0; }
.post-body ul, .post-body ol { padding-left: 1.5rem; }

/* — Home / hero — */

.hero {
  border-bottom: 1px solid var(--rule);
  padding-bottom: 2.5rem;
  margin-bottom: 2.5rem;
  max-width: var(--measure);
}
.hero .eyebrow {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--mute);
  margin-bottom: 1rem;
}
.hero h1 {
  font-size: clamp(2.6rem, 6vw, 4rem);
  font-variation-settings: "opsz" 144, "SOFT" 30;
  letter-spacing: -0.02em;
  line-height: 1.05;
  margin-bottom: 1.5rem;
}
.hero .intro { font-size: 1.15rem; color: var(--mute); }
.hero .body { font-size: 1.05rem; }

/* — Recent posts list — */

.entry-list { list-style: none; padding: 0; margin: 0; }
.entry-list li {
  border-bottom: 1px solid var(--rule);
  padding: 1.3rem 0;
  display: grid;
  grid-template-columns: 7rem 1fr;
  gap: 1.5rem;
  align-items: baseline;
}
.entry-list li:last-child { border-bottom: none; }
.entry-list time { padding-top: 0.3em; }
.entry-list a {
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 500;
  font-variation-settings: "opsz" 24, "SOFT" 30;
  text-decoration: none;
  letter-spacing: -0.005em;
  line-height: 1.25;
}
.entry-list a:hover { color: var(--accent); }
.entry-list .excerpt { color: var(--mute); margin-top: 0.4rem; font-size: 0.95rem; }

@media (max-width: 540px) {
  .entry-list li { grid-template-columns: 1fr; gap: 0.4rem; }
  .entry-list time { padding-top: 0; }
}

/* — Footer — */

.site-footer {
  border-top: 1px solid var(--rule);
  padding: 2rem var(--gutter);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--mute);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}
.site-footer .colophon { max-width: 28rem; }

/* — Preview banner (when ?preview=1) — */

.preview-banner {
  background: var(--accent);
  color: var(--paper);
  padding: 0.4rem var(--gutter);
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-align: center;
}
[data-theme="dark"] .preview-banner { color: var(--ink); }

/* — Contact form — */

.contact-form {
  margin-top: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
  max-width: var(--measure);
}
.contact-label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.contact-label > span {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--mute);
}
.contact-form input,
.contact-form textarea {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--rule-strong);
  font: inherit;
  font-size: 1rem;
  color: var(--ink);
  padding: 0.4rem 0;
  width: 100%;
}
.contact-form textarea {
  resize: vertical;
  min-height: 7rem;
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 0.8rem;
}
.contact-form input:focus,
.contact-form textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.contact-captcha {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.contact-captcha-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--mute);
}
.contact-submit {
  align-self: flex-start;
  appearance: none;
  background: var(--ink);
  color: var(--paper);
  border: 1px solid var(--ink);
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 0.7rem 1.6rem;
  cursor: pointer;
  transition: background 150ms, color 150ms, border-color 150ms;
}
.contact-submit:hover:not(:disabled) {
  background: var(--accent);
  border-color: var(--accent);
}
.contact-submit:disabled {
  opacity: 0.6;
  cursor: progress;
}
.contact-status {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--mute);
  min-height: 1.2em;
  margin: 0;
}
.contact-status[data-error] {
  color: var(--accent);
}

/* — 404 — */

.notfound {
  max-width: var(--measure);
  text-align: center;
  margin: 4rem auto;
}
.notfound .glyph {
  font-family: var(--font-display);
  font-size: clamp(6rem, 18vw, 12rem);
  line-height: 0.8;
  color: var(--accent);
  margin-bottom: 1rem;
  font-variation-settings: "opsz" 144, "SOFT" 100;
}
`;

/** Runs in <head> before paint to avoid FOUC. Resolves the
 *  three-way preference (system / light / dark) into a concrete
 *  data-theme value. Stored value `system` (or unset) means "follow
 *  prefers-color-scheme"; explicit `light` / `dark` overrides. */
export const THEME_BOOTSTRAP_JS = `
(function(){try{
  var stored = localStorage.getItem('mantle-theme');
  var t;
  if(stored === 'light' || stored === 'dark'){
    t = stored;
  } else {
    t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', t);
}catch(e){}})();
`;

export const HEADER_RUNTIME_JS = `
(function(){
  var html = document.documentElement;

  // — Popover plumbing (one toggleable menu at a time) —
  var openTrigger = null;
  function closeOpen(){
    if(!openTrigger) return;
    var name = openTrigger.getAttribute('data-popover-trigger');
    var menu = document.querySelector('[data-popover-menu="' + name + '"]');
    if(menu){ menu.hidden = true; }
    openTrigger.setAttribute('aria-expanded', 'false');
    openTrigger = null;
  }
  document.addEventListener('click', function(e){
    var trigger = e.target.closest && e.target.closest('[data-popover-trigger]');
    if(trigger){
      e.preventDefault();
      e.stopPropagation();
      var name = trigger.getAttribute('data-popover-trigger');
      var menu = document.querySelector('[data-popover-menu="' + name + '"]');
      if(!menu) return;
      var isOpen = openTrigger === trigger;
      closeOpen();
      if(!isOpen){
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        openTrigger = trigger;
      }
      return;
    }
    var item = e.target.closest && e.target.closest('.popover-item');
    if(item){ return; /* handled by per-popover listeners below */ }
    closeOpen();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && openTrigger){ closeOpen(); }
  });

  // — Theme: 3-way (system / light / dark) —
  function resolveSystem(){
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(stored){
    var t = (stored === 'light' || stored === 'dark') ? stored : resolveSystem();
    html.setAttribute('data-theme', t);
    refreshThemeUi(stored);
    document.dispatchEvent(new CustomEvent('mantle:theme', { detail: { theme: t, stored: stored } }));
  }
  function refreshThemeUi(stored){
    var key = (stored === 'light' || stored === 'dark') ? stored : 'system';
    document.querySelectorAll('[data-theme-icon]').forEach(function(el){
      el.hidden = el.getAttribute('data-theme-icon') !== key;
    });
    document.querySelectorAll('[data-popover-menu="theme"] [data-value]').forEach(function(item){
      item.setAttribute('aria-checked', item.getAttribute('data-value') === key ? 'true' : 'false');
    });
  }
  var themeMenu = document.querySelector('[data-popover-menu="theme"]');
  if(themeMenu){
    themeMenu.addEventListener('click', function(e){
      var item = e.target.closest('[data-value]');
      if(!item) return;
      var v = item.getAttribute('data-value');
      try {
        if(v === 'system'){ localStorage.removeItem('mantle-theme'); }
        else { localStorage.setItem('mantle-theme', v); }
      } catch(_){}
      applyTheme(v === 'system' ? null : v);
      closeOpen();
    });
  }
  // Initial UI sync (bootstrap script already set [data-theme]).
  try { refreshThemeUi(localStorage.getItem('mantle-theme')); } catch(_){}
  // Follow OS theme changes when the user picked 'system'.
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(){
      var stored = localStorage.getItem('mantle-theme');
      if(!stored){ applyTheme(null); }
    });
  } catch(_){}

  // — Lang: navigate to equivalent path under the chosen locale —
  var langMenu = document.querySelector('[data-popover-menu="lang"]');
  if(langMenu){
    langMenu.addEventListener('click', function(e){
      var item = e.target.closest('[data-value]');
      if(!item) return;
      var to = item.getAttribute('data-value');
      var current = item.getAttribute('data-current-locale');
      var path = location.pathname;
      var next;
      if(current && path.indexOf('/' + current) === 0){
        next = '/' + to + path.substring(('/' + current).length);
      } else {
        next = '/' + to;
      }
      location.href = next + location.search;
    });
  }
})();
`;

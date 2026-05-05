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
  padding: 1.25rem var(--gutter);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  background: var(--paper);
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
  gap: 0.75rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
}
.site-controls select,
.site-controls button {
  appearance: none;
  background: transparent;
  color: inherit;
  font: inherit;
  border: 1px solid var(--rule);
  border-radius: 2px;
  padding: 0.3rem 0.55rem;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.site-controls select:hover,
.site-controls button:hover { border-color: var(--ink); color: var(--accent); }
.site-controls select { padding-right: 1.5rem; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: right 0.55rem top 50%, right 0.3rem top 50%; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }
.site-controls .theme-toggle { min-width: 2.2rem; text-align: center; }
.site-controls .theme-toggle .glyph-light { display: none; }
.site-controls .theme-toggle .glyph-dark { display: inline; }
[data-theme="dark"] .site-controls .theme-toggle .glyph-light { display: inline; }
[data-theme="dark"] .site-controls .theme-toggle .glyph-dark { display: none; }

@media (max-width: 720px) {
  .site-header { flex-direction: column; align-items: flex-start; gap: 0.75rem; }
  .site-nav { justify-content: flex-start; gap: 1rem; }
  .site-controls { align-self: flex-end; margin-top: -2rem; }
}

/* — Main + article — */

.site-main {
  flex: 1 0 auto;
  padding: clamp(2rem, 6vw, 4rem) var(--gutter);
  max-width: 64rem;
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

/** Set [data-theme] before paint to avoid FOUC. Reads localStorage,
 *  falls back to prefers-color-scheme. */
export const THEME_BOOTSTRAP_JS = `
(function(){try{
  var t = localStorage.getItem('clam-theme');
  if(!t){ t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  document.documentElement.setAttribute('data-theme', t);
}catch(e){}})();
`;

export const HEADER_RUNTIME_JS = `
(function(){
  var html = document.documentElement;
  var btn = document.querySelector('[data-theme-toggle]');
  if(btn){
    btn.addEventListener('click', function(){
      var next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      html.setAttribute('data-theme', next);
      try{ localStorage.setItem('clam-theme', next); }catch(e){}
    });
  }
  var sel = document.querySelector('[data-locale-switch]');
  if(sel){
    sel.addEventListener('change', function(e){
      var to = e.target.value;
      var current = sel.getAttribute('data-current');
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

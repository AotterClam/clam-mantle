/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotter/mantle-spec";
import { renderSeoTagsHtml, type SeoMeta } from "@aotter/mantle-runtime";
import { html, raw } from "hono/html";
import { HEADER_RUNTIME_JS, SITE_CSS, THEME_BOOTSTRAP_JS } from "../styles.js";
import { TOKENS_CSS } from "../tokens.js";
import { Header, type HeaderProps } from "./Header.js";

/** Page chrome (HTML envelope, head, header, footer). Templates
 *  compose `<Layout>{children}</Layout>`.
 *
 *  When `seo` is provided (every public entry / list page through
 *  `mountPublicRoutes`), the SDK-composed canonical / hreflang /
 *  `.md` alternate / og: / twitter / JSON-LD block is emitted from
 *  `renderSeoTagsHtml`. Hand-rolled meta in `<head>` is the
 *  fall-back path for templates the publish pipeline doesn't reach
 *  (404, contact form). */
export interface LayoutProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly title: string;
  readonly description?: string;
  readonly ogImage?: string;
  readonly current?: HeaderProps["current"];
  readonly seo?: SeoMeta;
  readonly children: unknown;
}

export function Layout(props: LayoutProps) {
  const { site, locale, title, description, ogImage, current, seo, children } = props;
  return (
    <html lang={locale || site.canonicalLocale || "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {seo ? html`${raw(renderSeoTagsHtml(seo))}` : null}
        {!seo && description ? <meta name="description" content={description} /> : null}
        {!seo && ogImage ? <meta property="og:image" content={ogImage} /> : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+TC:wght@400;500;600&display=swap"
        />
        <style>{raw(TOKENS_CSS + SITE_CSS)}</style>
        {html`<script>${raw(THEME_BOOTSTRAP_JS)}</script>`}
      </head>
      <body>
        <Header site={site} locale={locale} current={current} />
        <main class="site-main">{children}</main>
        <footer class="site-footer">
          <div class="colophon">
            {site.brand} · {site.description ?? ""}
          </div>
          <div>
            built on{" "}
            <a href="https://github.com/aotter/mantle">mantle·cms</a>
          </div>
        </footer>
        {html`<script>${raw(HEADER_RUNTIME_JS)}</script>`}
      </body>
    </html>
  );
}

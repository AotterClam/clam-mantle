/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import { html, raw } from "hono/html";
import { HEADER_RUNTIME_JS, SITE_CSS, THEME_BOOTSTRAP_JS } from "../styles.js";
import { Header, type HeaderProps } from "./Header.js";

/** Page chrome (HTML envelope, head, header, footer). Templates
 *  compose `<Layout>{children}</Layout>`. */
export interface LayoutProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly title: string;
  readonly description?: string;
  readonly ogImage?: string;
  readonly current?: HeaderProps["current"];
  readonly preview?: boolean;
  readonly children: unknown;
}

export function Layout(props: LayoutProps) {
  const { site, locale, title, description, ogImage, current, preview, children } = props;
  return (
    <html lang={locale || site.canonicalLocale || "en"}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        {ogImage ? <meta property="og:image" content={ogImage} /> : null}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&family=JetBrains+Mono:wght@400;500&family=Noto+Serif+TC:wght@400;500;600&display=swap"
        />
        <style>{raw(SITE_CSS)}</style>
        {html`<script>${raw(THEME_BOOTSTRAP_JS)}</script>`}
      </head>
      <body>
        {preview ? <div class="preview-banner">Preview · unpublished content</div> : null}
        <Header site={site} locale={locale} current={current} />
        <main class="site-main">{children}</main>
        <footer class="site-footer">
          <div class="colophon">
            {site.brand} · {site.description ?? ""}
          </div>
          <div>
            built on{" "}
            <a href="https://github.com/AotterClam/clam-cms">clam·cms</a>
          </div>
        </footer>
        {html`<script>${raw(HEADER_RUNTIME_JS)}</script>`}
      </body>
    </html>
  );
}

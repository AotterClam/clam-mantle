/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import { renderSeoTagsHtml, type SeoMeta } from "@aotterclam/clam-cms-runtime";
import { html, raw } from "hono/html";
import overrides from "../../theme/index.js";
import { HEADER_RUNTIME_JS, SITE_CSS, THEME_BOOTSTRAP_JS } from "../styles.js";
import { TOKENS_CSS } from "../tokens.js";
import { Header as BaselineHeader, type HeaderProps } from "./Header.js";
import { Footer as BaselineFooter } from "./Footer.js";

/**
 * Page chrome (HTML envelope, head, header, footer). Templates
 * compose `<Layout>{children}</Layout>`.
 *
 * Slot resolution at module init: Header and Footer fall through to
 * baseline if `theme/index.ts:components.{Header,Footer}` is unset.
 * Layout itself is NOT a slot — to change the envelope shape, fork
 * the relevant template (L4) or pick a different starter.
 *
 * When `seo` is provided (every public entry / list page through
 * `mountPublicRoutes`), the SDK-composed canonical / hreflang /
 * `.md` alternate / og: / twitter / JSON-LD block is emitted from
 * `renderSeoTagsHtml`. Hand-rolled meta in `<head>` is the
 * fall-back path for templates the publish pipeline doesn't reach
 * (404, contact form).
 */
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

const Header = overrides.components?.Header ?? BaselineHeader;
const Footer = overrides.components?.Footer ?? BaselineFooter;
const SITE_CSS_RESOLVED =
  TOKENS_CSS + (overrides.tokens ?? "") + SITE_CSS + (overrides.extraCss ?? "");

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
        <style>{raw(SITE_CSS_RESOLVED)}</style>
        {html`<script>${raw(THEME_BOOTSTRAP_JS)}</script>`}
      </head>
      <body>
        <Header site={site} locale={locale} current={current} />
        <main class="site-main">{children}</main>
        <Footer site={site} locale={locale} />
        {html`<script>${raw(HEADER_RUNTIME_JS)}</script>`}
      </body>
    </html>
  );
}

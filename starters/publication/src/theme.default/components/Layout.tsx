/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotter/mantle-spec";
import { renderSeoTagsHtml, type SeoMeta } from "@aotter/mantle-runtime";
import { html, raw } from "hono/html";
import overrides from "../../theme/index.js";
import { HEADER_RUNTIME_JS, SITE_CSS, THEME_BOOTSTRAP_JS } from "../styles.js";
import { TOKENS_CSS } from "../tokens.js";
import { PageShell as BaselinePageShell } from "./PageShell.js";
import type { HeaderProps } from "./Header.js";

/**
 * Document envelope (`<html>` / `<head>` / `<body>` + SEO meta +
 * theme bootstrap script). Templates compose
 * `<Layout>{children}</Layout>`.
 *
 * Layout itself is NOT a slot — `<head>` shape, SEO emission order,
 * and theme bootstrap timing are concerns that cross the starter-
 * family line and shouldn't be redefined per page. Body layout
 * (Header / `<main>` / Footer arrangement, sticky CTAs, sidebar
 * variants) is delegated to the `PageShell` slot, which IS
 * overridable at the L3 layer; chrome-only swaps continue to use
 * the existing `Header` / `Footer` slots.
 *
 * Slot resolution at module init: PageShell falls through to the
 * baseline if `theme/index.ts:components.PageShell` is unset. The
 * baseline PageShell in turn resolves Header / Footer overrides —
 * a consumer-supplied PageShell takes ownership of how (or whether)
 * to render those.
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

const PageShell = overrides.components?.PageShell ?? BaselinePageShell;
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
        <style>{raw(SITE_CSS_RESOLVED)}</style>
        {html`<script>${raw(THEME_BOOTSTRAP_JS)}</script>`}
      </head>
      <body>
        <PageShell site={site} locale={locale} current={current}>
          {children}
        </PageShell>
        {html`<script>${raw(HEADER_RUNTIME_JS)}</script>`}
      </body>
    </html>
  );
}

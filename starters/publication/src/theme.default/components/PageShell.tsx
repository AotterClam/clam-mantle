/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import overrides from "../../theme/index.js";
import { Header as BaselineHeader, type HeaderProps } from "./Header.js";
import { Footer as BaselineFooter } from "./Footer.js";

/**
 * Body composition slot — the arrangement of Header / `<main>` /
 * Footer (and any sticky CTA, sidebar, full-bleed sections, etc.)
 * inside the document body.
 *
 * `Layout` owns the document envelope (`<html>` / `<head>` / `<body>`
 * + SEO meta + theme bootstrap script). PageShell is the body-level
 * layout decision: where Header sits, whether `<main>` has a max-
 * width container or runs full-bleed, whether a sticky footer CTA
 * sits between `<main>` and the real `<Footer>`, etc.
 *
 * Splitting these is the answer to "publication carries landing /
 * articles / docs-lite / public widgets — they need different body
 * layouts but share the same `<head>`". L3 chrome swaps (Header,
 * Footer) stay separate slots; PageShell is the broader L3 escape
 * hatch when chrome alone isn't enough but a full L4 template fork
 * is too much.
 *
 * Override flow: `theme/index.ts:components.PageShell` replaces this
 * baseline. The override is responsible for picking what to do with
 * the Header/Footer overrides — typically it composes them just
 * like the baseline does, but a consumer can ignore them and render
 * whatever chrome the new shape requires.
 *
 * Layout itself is NOT a slot. Changing `<head>` shape, SEO
 * emission, or theme-bootstrap timing means picking a different
 * starter family (`micro-shop`, `community`, ...) — those concerns
 * cross the family line and don't belong in a per-page override.
 */
export interface PageShellProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly current?: HeaderProps["current"];
  readonly children: unknown;
}

const Header = overrides.components?.Header ?? BaselineHeader;
const Footer = overrides.components?.Footer ?? BaselineFooter;

export function PageShell(props: PageShellProps) {
  const { site, locale, current, children } = props;
  return (
    <>
      <Header site={site} locale={locale} current={current} />
      <main class="site-main">{children}</main>
      <Footer site={site} locale={locale} />
    </>
  );
}

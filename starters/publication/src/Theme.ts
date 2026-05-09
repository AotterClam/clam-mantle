/**
 * Theme override contract for `src/theme/index.ts`.
 *
 * Layered override scheme; any key omitted falls through to the
 * `theme.default/` baseline. The four levels (L1–L4) describe the
 * recommended escalation when CC and the human user are iterating
 * on visual identity:
 *
 *   L1  tokens     — palette, type scale, measure, gutter
 *   L2  extraCss   — additional rules (icons / i18n / extraCss)
 *   L3  components — Header / Footer chrome swaps, or PageShell for
 *                    body-layout variation (sidebar, sticky CTA,
 *                    full-bleed sections, etc.)
 *   L4  templates  — replace a whole page's render function
 *
 * Layout (the document envelope — `<html>` / `<head>` / `<body>`
 * + SEO meta + theme bootstrap) is intentionally NOT a slot.
 * Changing those concerns crosses the starter-family line; switch
 * starter (publication → community / micro-shop / ...) instead.
 * PageShell covers body-layout variation inside the publication
 * family without forking every template.
 */
import type { EntryContext, ListContext } from "@aotterclam/clam-cms-runtime";
import type { I18nBundle } from "./i18n/index.js";
import type { Header } from "./theme.default/components/Header.js";
import type { Footer } from "./theme.default/components/Footer.js";
import type { PageShell } from "./theme.default/components/PageShell.js";
import type { HomeContext } from "./theme.default/templates/home.js";
import type { ContactContext } from "./theme.default/templates/contact.js";
import type { NotFoundContext } from "./theme.default/templates/notFound.js";

type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface ThemeOverride {
  /** L1 — extra CSS appended AFTER baseline `tokens.ts`. Declare
   *  `:root { ... }` here to shadow design vars; later declarations
   *  win on standard CSS specificity rules. Same for
   *  `[data-theme="dark"]`. */
  tokens?: string;

  /** L2 — extra CSS appended AFTER baseline `styles.ts`. Use for
   *  ad-hoc rules a consumer wants to add without forking the whole
   *  stylesheet. Because this is appended after normal rules, CSS
   *  `@import` statements are too late here; use `@font-face` for
   *  custom fonts. */
  extraCss?: string;

  /** L2 — additional or overriding icons. Each value is the inner
   *  SVG markup (paths / circles / etc.), no `<svg>` wrapper. Spread
   *  AFTER baseline so identically-named icons override; new keys
   *  add to the set. */
  icons?: Record<string, string>;

  /** L2 — partial bundle deep-merged OVER the baseline bundle for
   *  each locale. Touch only the keys you want to retitle; leaves
   *  the rest. */
  i18n?: { [locale: string]: DeepPartial<I18nBundle> };

  /** L3 — body-level component slots.
   *
   *  - `Header` / `Footer` swap navigation chrome only (logo, nav,
   *    language switcher, copyright, ...). They sit inside the
   *    baseline `PageShell` between `<main>`'s open and close.
   *  - `PageShell` swaps the broader body composition — Header /
   *    `<main>` / Footer arrangement, sticky CTAs, sidebar variants,
   *    full-bleed hero sections — without redoing the document
   *    envelope. A consumer-supplied PageShell takes ownership of
   *    whether or how to render the Header / Footer overrides; the
   *    baseline composes them in the conventional top → main →
   *    bottom order.
   *
   *  Layout (the document envelope) is NOT a slot. Switch starter
   *  family (publication → community / micro-shop / ...) when the
   *  shape you need crosses that line. */
  components?: {
    Header?: typeof Header;
    Footer?: typeof Footer;
    PageShell?: typeof PageShell;
  };

  /** L4 — replace a page kind's render function in whole. Forks
   *  imply the consumer takes responsibility for the layout +
   *  chrome the template renders. */
  templates?: {
    post?: (ctx: EntryContext) => string;
    postList?: (ctx: ListContext) => string;
    page?: (ctx: EntryContext) => string;
    home?: (ctx: HomeContext) => string;
    contact?: (ctx: ContactContext) => string;
    notFound?: (ctx: NotFoundContext) => string;
  };
}

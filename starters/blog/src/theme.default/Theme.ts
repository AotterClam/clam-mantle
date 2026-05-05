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
 *   L3  components — Header or Footer chrome slot
 *   L4  templates  — replace a whole page's render function
 *
 * Layout shape itself is intentionally NOT a slot: changing it means
 * picking a different starter (e.g. `starters/blog` vs a future docs
 * starter). Header / Footer cover the actual chrome variation users
 * tend to ask for inside the same content shape.
 */
import type { EntryContext, ListContext } from "@aotterclam/clam-cms-runtime";
import type { I18nBundle } from "../i18n/index.js";
import type { Header } from "./components/Header.js";
import type { Footer } from "./components/Footer.js";
import type { HomeContext } from "./templates/home.js";
import type { ContactContext } from "./templates/contact.js";
import type { NotFoundContext } from "./templates/notFound.js";

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
   *  stylesheet. */
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

  /** L3 — chrome component slots. Header sits at the top of every
   *  page inside the baseline Layout; Footer sits at the bottom. To
   *  swap the whole page envelope, prefer forking the relevant
   *  template (L4) over trying to override Layout itself. */
  components?: {
    Header?: typeof Header;
    Footer?: typeof Footer;
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

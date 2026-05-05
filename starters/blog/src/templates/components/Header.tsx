/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotter/mantle-spec";

/**
 * Reusable site header. Lives at the top of every public page —
 * brand, primary nav, locale switcher, theme toggle. The toggle +
 * switcher are wired by an inline script in `Layout` (see
 * `HEADER_RUNTIME_JS` in `styles.ts`).
 *
 * `current` marks the active nav item with `aria-current="page"`.
 * `locale` is the page's locale (used to compose nav hrefs and to
 * pre-select the locale dropdown).
 */
export interface HeaderProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly current?: "home" | "posts" | "about" | "contact";
}

const NAV_LABELS: Record<string, Record<string, string>> = {
  en: { posts: "Posts", about: "About", contact: "Contact" },
  "zh-tw": { posts: "文章", about: "關於", contact: "聯絡" },
};

function labels(locale: string): Record<string, string> {
  return NAV_LABELS[locale.toLowerCase()] ?? NAV_LABELS.en!;
}

export function Header(props: HeaderProps) {
  const { site, locale, current } = props;
  const l = labels(locale);
  const localesAvailable = site.locales ?? [locale];
  return (
    <>
      <header class="site-header">
        <a class="brand" href={`/${locale}`} aria-label={site.brand}>
          {brandWordmark(site.brand)}
        </a>
        <nav class="site-nav" aria-label="Primary">
          <a href={`/${locale}/posts`} aria-current={current === "posts" ? "page" : undefined}>
            {l.posts}
          </a>
          <a href={`/${locale}/pages/about`} aria-current={current === "about" ? "page" : undefined}>
            {l.about}
          </a>
          <a href={`/${locale}/pages/contact`} aria-current={current === "contact" ? "page" : undefined}>
            {l.contact}
          </a>
        </nav>
        <div class="site-controls">
          <select
            data-locale-switch
            data-current={locale}
            aria-label="Language"
          >
            {localesAvailable.map((loc) => (
              <option value={loc} selected={loc.toLowerCase() === locale.toLowerCase()}>
                {localeLabel(loc)}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-theme-toggle
            class="theme-toggle"
            aria-label="Toggle color theme"
            title="Toggle color theme"
          >
            <span class="glyph-dark" aria-hidden="true">◑</span>
            <span class="glyph-light" aria-hidden="true">◐</span>
          </button>
        </div>
      </header>
    </>
  );
}

function brandWordmark(brand: string) {
  // Insert a vermillion middle-dot for any space-separated brand
  // (`Mantle Blog` → `Mantle·Blog`); keeps a readable wordmark while
  // maintaining the publication-mark feel.
  if (brand.includes(" ")) {
    const [first, ...rest] = brand.split(" ");
    return (
      <>
        {first}
        <span class="dot" aria-hidden="true">·</span>
        {rest.join(" ")}
      </>
    );
  }
  return <>{brand}</>;
}

function localeLabel(locale: string): string {
  const lower = locale.toLowerCase();
  if (lower === "zh-tw" || lower === "zh-tw") return "中";
  if (lower === "en") return "EN";
  return locale.toUpperCase();
}

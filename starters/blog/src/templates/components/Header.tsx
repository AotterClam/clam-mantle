/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import { pickCopy } from "../utils.js";

export interface HeaderProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly current?: "home" | "posts" | "about" | "contact";
}

const NAV_LABELS = {
  en: { posts: "Posts", about: "About", contact: "Contact" },
  "zh-tw": { posts: "文章", about: "關於", contact: "聯絡" },
};

const LOCALE_LABEL: Record<string, string> = {
  en: "EN",
  "zh-tw": "中",
};

function localeLabel(locale: string): string {
  return LOCALE_LABEL[locale.toLowerCase()] ?? locale.toUpperCase();
}

function brandWordmark(brand: string) {
  // Insert a vermillion middle-dot for any space-separated brand
  // (`Clam Blog` → `Clam·Blog`); keeps a publication-mark feel.
  if (!brand.includes(" ")) return brand;
  const [first, ...rest] = brand.split(" ");
  return (
    <>
      {first}
      <span class="dot" aria-hidden="true">·</span>
      {rest.join(" ")}
    </>
  );
}

export function Header(props: HeaderProps) {
  const { site, locale, current } = props;
  const nav = pickCopy(NAV_LABELS, locale);
  const localesAvailable = site.locales ?? [locale];
  return (
    <header class="site-header">
      <a class="brand" href={`/${locale}`} aria-label={site.brand}>
        {brandWordmark(site.brand)}
      </a>
      <nav class="site-nav" aria-label="Primary">
        <a href={`/${locale}/posts`} aria-current={current === "posts" ? "page" : undefined}>
          {nav.posts}
        </a>
        <a href={`/${locale}/pages/about`} aria-current={current === "about" ? "page" : undefined}>
          {nav.about}
        </a>
        <a href={`/${locale}/pages/contact`} aria-current={current === "contact" ? "page" : undefined}>
          {nav.contact}
        </a>
      </nav>
      <div class="site-controls">
        <select data-locale-switch data-current={locale} aria-label="Language">
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
  );
}

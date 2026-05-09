/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { SiteConfig } from "@aotter/mantle-spec";
import { I18N_BUNDLES, bundleFor, localeLabel } from "../../i18n/index.js";
import { icon } from "../icons.js";

export interface HeaderProps {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly current?: "home" | "posts" | "about" | "contact";
}

export function Header(props: HeaderProps) {
  const { site, locale, current } = props;
  const t = bundleFor(locale);
  const localesAvailable = (site.locales ?? [locale]).filter(
    (l) => I18N_BUNDLES[l.toLowerCase()] != null,
  );
  return (
    <header class="site-header">
      <a class="brand" href={`/${locale}`} aria-label={site.brand}>
        {site.brand}
      </a>
      <nav class="site-nav" aria-label="Primary">
        <a href={`/${locale}/posts`} aria-current={current === "posts" ? "page" : undefined}>
          {t.header.posts}
        </a>
        <a href={`/${locale}/pages/about`} aria-current={current === "about" ? "page" : undefined}>
          {t.header.about}
        </a>
        <a href={`/${locale}/pages/contact`} aria-current={current === "contact" ? "page" : undefined}>
          {t.header.contact}
        </a>
      </nav>
      <div class="site-controls">
        <div class="popover" data-popover-root="lang">
          <button
            type="button"
            class="popover-trigger popover-trigger-text"
            data-popover-trigger="lang"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-label={t.lang.ariaLabel}
          >
            {raw(icon("globe", { size: 14 }))}
            <span class="popover-trigger-label">{localeLabel(locale)}</span>
            {raw(icon("chevron-down", { size: 12 }))}
          </button>
          <div class="popover-menu" role="menu" data-popover-menu="lang" hidden>
            {localesAvailable.map((loc) => (
              <button
                type="button"
                class="popover-item"
                role="menuitemradio"
                data-value={loc}
                data-current-locale={locale}
                aria-checked={loc.toLowerCase() === locale.toLowerCase() ? "true" : "false"}
              >
                <span class="popover-item-label">{localeLabel(loc)}</span>
                <span class="popover-item-check">{raw(icon("check"))}</span>
              </button>
            ))}
          </div>
        </div>
        <div class="popover" data-popover-root="theme">
          <button
            type="button"
            class="popover-trigger popover-trigger-icon"
            data-popover-trigger="theme"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-label={t.theme.ariaLabel}
          >
            <span data-theme-icon="system">{raw(icon("monitor"))}</span>
            <span data-theme-icon="light" hidden>
              {raw(icon("sun"))}
            </span>
            <span data-theme-icon="dark" hidden>
              {raw(icon("moon"))}
            </span>
          </button>
          <div class="popover-menu" role="menu" data-popover-menu="theme" hidden>
            <button
              type="button"
              class="popover-item"
              role="menuitemradio"
              data-value="light"
              aria-checked="false"
            >
              <span class="popover-item-icon">{raw(icon("sun"))}</span>
              <span class="popover-item-label">{t.theme.light}</span>
              <span class="popover-item-check">{raw(icon("check"))}</span>
            </button>
            <button
              type="button"
              class="popover-item"
              role="menuitemradio"
              data-value="dark"
              aria-checked="false"
            >
              <span class="popover-item-icon">{raw(icon("moon"))}</span>
              <span class="popover-item-label">{t.theme.dark}</span>
              <span class="popover-item-check">{raw(icon("check"))}</span>
            </button>
            <button
              type="button"
              class="popover-item"
              role="menuitemradio"
              data-value="system"
              aria-checked="true"
            >
              <span class="popover-item-icon">{raw(icon("monitor"))}</span>
              <span class="popover-item-label">{t.theme.auto}</span>
              <span class="popover-item-check">{raw(icon("check"))}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

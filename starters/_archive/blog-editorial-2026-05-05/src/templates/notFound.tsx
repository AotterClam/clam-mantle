/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import { Layout } from "./components/Layout.js";
import { bundleFor } from "../i18n/index.js";

export interface NotFoundContext {
  readonly site: SiteConfig;
  readonly locale: string;
}

export function notFoundTemplate(ctx: NotFoundContext): string {
  const { site, locale } = ctx;
  const t = bundleFor(locale).notFound;
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`404 — ${site.brand}`}
      description={t.body}
    >
      <section class="notfound">
        <div class="glyph" aria-hidden="true">404</div>
        <h1>{t.title}</h1>
        <p>{t.body}</p>
        <p>
          <a href={`/${locale}`}>{t.back}</a>
        </p>
      </section>
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

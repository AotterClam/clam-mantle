/** @jsxImportSource hono/jsx */
import type { SiteConfig } from "@aotterclam/clam-cms-spec";
import { Layout } from "./components/Layout.js";
import { pickCopy } from "./utils.js";

const COPY = {
  en: {
    title: "Lost at sea",
    body: "The page you sought is unwritten — or unpublished, or unremembered.",
    back: "Return to the homepage",
  },
  "zh-tw": {
    title: "迷失於海",
    body: "你尋找的頁面尚未寫成 — 或者未發布、或者已散佚。",
    back: "回到首頁",
  },
};

export interface NotFoundContext {
  readonly site: SiteConfig;
  readonly locale: string;
}

export function notFoundTemplate(ctx: NotFoundContext): string {
  const { site, locale } = ctx;
  const copy = pickCopy(COPY, locale);
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`404 — ${site.brand}`}
      description={copy.body}
    >
      <section class="notfound">
        <div class="glyph" aria-hidden="true">404</div>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <p>
          <a href={`/${locale}`}>{copy.back}</a>
        </p>
      </section>
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

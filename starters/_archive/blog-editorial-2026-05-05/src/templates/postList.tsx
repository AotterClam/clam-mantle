/** @jsxImportSource hono/jsx */
import type { ListContext } from "@aotterclam/clam-cms-runtime";
import { Layout } from "./components/Layout.js";
import { bundleFor } from "../i18n/index.js";
import { excerpt, isoDate } from "./utils.js";

export function postListTemplate(ctx: ListContext): string {
  const { entries, locale, site, seo } = ctx;
  const t = bundleFor(locale).postList;
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${t.title} — ${site.brand}`}
      description={site.description}
      current="posts"
      seo={seo}
    >
      <section class="hero">
        <div class="eyebrow">{t.eyebrow}</div>
        <h1>{t.title}</h1>
      </section>
      <ul class="entry-list">
        {entries.map((e) => {
          const data = e.data as {
            slug?: string;
            title?: string;
            body?: string;
            locale?: string;
          };
          const href = `/${data.locale ?? locale}/posts/${data.slug ?? e.id}`;
          return (
            <li>
              <time>{isoDate(e.updatedAt)}</time>
              <div>
                <a href={href}>{data.title ?? data.slug ?? e.id}</a>
                <div class="excerpt">{excerpt(data.body)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </Layout>
  );
  return String(tree);
}

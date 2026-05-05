/** @jsxImportSource hono/jsx */
import type { ListContext } from "@aotterclam/clam-cms-runtime";
import { Layout } from "./components/Layout.js";
import { excerpt, isoDate, pickCopy } from "./utils.js";

const HEADINGS = {
  en: { title: "Posts", eyebrow: "the index" },
  "zh-tw": { title: "文章", eyebrow: "目錄" },
};

export function postListTemplate(ctx: ListContext): string {
  const { entries, locale, site } = ctx;
  const heading = pickCopy(HEADINGS, locale);
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${heading.title} — ${site.brand}`}
      description={site.description}
      current="posts"
    >
      <section class="hero">
        <div class="eyebrow">{heading.eyebrow}</div>
        <h1>{heading.title}</h1>
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

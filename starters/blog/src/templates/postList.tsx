/** @jsxImportSource hono/jsx */
import type { ListContext } from "@aotter/mantle-runtime";
import { Layout } from "./components/Layout.js";

const HEADINGS: Record<string, { title: string; eyebrow: string }> = {
  en: { title: "Posts", eyebrow: "the index" },
  "zh-tw": { title: "文章", eyebrow: "目錄" },
};

function excerpt(body: string | undefined): string {
  if (!body) return "";
  const first = body.split(/\n+/).find((l) => l.trim().length > 0) ?? "";
  return first.length > 140 ? first.slice(0, 137) + "…" : first;
}

/**
 * Per-locale post list. Used as the locale's posts index
 * (`/{locale}/posts`). Sorted by `updatedAt` descending; runtime
 * supplies entries already filtered to `status: 'published'`.
 */
export function postListTemplate(ctx: ListContext): string {
  const { entries, locale, site } = ctx;
  const heading = HEADINGS[locale.toLowerCase()] ?? HEADINGS.en!;
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
          const updated = e.updatedAt
            ? new Date(e.updatedAt).toISOString().slice(0, 10)
            : "";
          return (
            <li>
              <time>{updated}</time>
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
  return "<!doctype html>" + String(tree);
}

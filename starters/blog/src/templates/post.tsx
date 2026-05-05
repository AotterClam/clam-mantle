/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { EntryContext } from "@aotter/mantle-runtime";
import { Layout } from "./components/Layout.js";
import { isoDate, renderMarkdown } from "./utils.js";

export function postTemplate(ctx: EntryContext): string {
  const { entry, site } = ctx;
  const data = entry.data as {
    slug?: string;
    title?: string;
    body?: string;
    locale?: string;
    coverUrl?: string;
    publishedAt?: number;
  };
  const locale = data.locale ?? site.canonicalLocale ?? "en";
  const title = data.title ?? data.slug ?? "Untitled";
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${title} — ${site.brand}`}
      description={site.description}
      ogImage={data.coverUrl}
      current="posts"
    >
      <article>
        <header class="post-meta">
          {data.publishedAt ? (
            <time dateTime={new Date(data.publishedAt).toISOString()}>
              {isoDate(data.publishedAt)}
            </time>
          ) : null}
          <h1>{title}</h1>
        </header>
        {data.coverUrl ? <img class="post-cover" src={data.coverUrl} alt="" /> : null}
        <div class="post-body">{raw(renderMarkdown(data.body))}</div>
      </article>
    </Layout>
  );
  return String(tree);
}

/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { marked } from "marked";
import type { EntryContext } from "@aotter/mantle-runtime";
import { Layout } from "./components/Layout.js";

const markedOptions = { gfm: true, breaks: false } as const;

/**
 * Single-post HTML template. Receives the `post-translations` entry
 * (a per-locale row joined to its parent `posts` for cover URL +
 * publish time). Markdown body is rendered with `marked` (CSP-safe —
 * no eval). The runtime renders this at publish time and writes the
 * result to KV; the public read path serves the cached HTML.
 */
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
  const bodyHtml = data.body ? (marked.parse(data.body, markedOptions) as string) : "";
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
              {new Date(data.publishedAt).toISOString().slice(0, 10)}
            </time>
          ) : null}
          <h1>{title}</h1>
        </header>
        {data.coverUrl ? <img class="post-cover" src={data.coverUrl} alt="" /> : null}
        <div class="post-body">{raw(bodyHtml)}</div>
      </article>
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

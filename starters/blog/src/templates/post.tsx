/** @jsxImportSource hono/jsx */
import type { EntryContext } from "@aotter/mantle-runtime";

/**
 * Single-post HTML template. Receives the `post-translations` entry
 * (a per-locale row joined to its parent `posts` for cover URL +
 * publish time). The runtime renders this at publish time and writes
 * the result to KV; the public read path serves the cached HTML.
 *
 * Markdown body rendering is intentionally minimal here — production
 * starters typically pipe `entry.data.body` through `marked` or a
 * shortcode preprocessor. For v0.1.0 we render as a `<pre>` block so
 * the demo stays dependency-free.
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
  const tree = (
    <html lang={data.locale ?? site.canonicalLocale ?? "en"}>
      <head>
        <meta charSet="utf-8" />
        <title>{`${data.title ?? data.slug ?? "Untitled"} — ${site.brand}`}</title>
        <meta name="description" content={site.description ?? ""} />
        {data.coverUrl ? <meta property="og:image" content={data.coverUrl} /> : null}
      </head>
      <body>
        <header>
          <a href="/">{site.brand}</a>
        </header>
        <main>
          <article>
            {data.coverUrl ? <img src={data.coverUrl} alt="" /> : null}
            <h1>{data.title}</h1>
            {data.publishedAt ? (
              <time dateTime={new Date(data.publishedAt).toISOString()}>
                {new Date(data.publishedAt).toISOString().slice(0, 10)}
              </time>
            ) : null}
            <pre style="white-space: pre-wrap; font-family: inherit;">{data.body ?? ""}</pre>
          </article>
        </main>
      </body>
    </html>
  );
  return String(tree);
}

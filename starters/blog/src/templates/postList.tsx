/** @jsxImportSource hono/jsx */
import type { ListContext } from "@aotter/mantle-runtime";

/**
 * Per-locale post-translations list HTML. Used as the locale's index
 * page (`/{locale}/posts`). Sorted by `updatedAt` descending; the
 * runtime supplies entries already filtered to `status: 'published'`.
 */
export function postListTemplate(ctx: ListContext): string {
  const { entries, locale, site } = ctx;
  const tree = (
    <html lang={locale || site.canonicalLocale || "en"}>
      <head>
        <meta charSet="utf-8" />
        <title>{site.brand}</title>
      </head>
      <body>
        <header>
          <h1>{site.brand}</h1>
          <p>{site.description}</p>
        </header>
        <main>
          <ul>
            {entries.map((e) => {
              const data = e.data as { slug?: string; title?: string; locale?: string };
              const href = `/${data.locale ?? locale}/posts/${data.slug ?? e.id}`;
              return (
                <li>
                  <a href={href}>{data.title ?? data.slug ?? e.id}</a>
                </li>
              );
            })}
          </ul>
        </main>
      </body>
    </html>
  );
  return String(tree);
}

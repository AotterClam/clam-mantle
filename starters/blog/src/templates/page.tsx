/** @jsxImportSource hono/jsx */
import type { EntryContext } from "@aotterclam/clam-cms-runtime";

/**
 * Single-page template (about, contact, privacy, etc.) — analogous
 * to `postTemplate` but no cover image and no publish timestamp.
 * Registered to `page-translations` in the TemplateRegistry; the
 * publish pipeline writes the rendered HTML to KV.
 *
 * `slug = "home"` rows are also rendered here when the publish
 * pipeline fires, but the public read path handles `/{locale}/`
 * via `homeTemplate` (which composes home + recent-posts), not
 * this template — so the KV entry for slug=home is unused on the
 * public surface. We still render it so admin UI preview / future
 * surfaces can link to a stable URL.
 */
export function pageTemplate(ctx: EntryContext): string {
  const { entry, site } = ctx;
  const data = entry.data as {
    slug?: string;
    title?: string;
    intro?: string;
    body?: string;
    locale?: string;
  };
  const tree = (
    <html lang={data.locale ?? site.canonicalLocale ?? "en"}>
      <head>
        <meta charSet="utf-8" />
        <title>{`${data.title ?? data.slug ?? "Untitled"} — ${site.brand}`}</title>
        <meta name="description" content={data.intro ?? site.description ?? ""} />
      </head>
      <body>
        <header>
          <a href={`/${data.locale ?? ""}`}>{site.brand}</a>
        </header>
        <main>
          <article>
            <h1>{data.title}</h1>
            {data.intro ? <p>{data.intro}</p> : null}
            <pre style="white-space: pre-wrap; font-family: inherit;">{data.body ?? ""}</pre>
          </article>
        </main>
      </body>
    </html>
  );
  return String(tree);
}

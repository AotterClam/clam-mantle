/** @jsxImportSource hono/jsx */
import type { Entry, SiteConfig } from "@aotter/mantle-spec";

/**
 * Home page template. Renders the page-translations row with
 * `slug = "home"` as a hero (title + intro), then a recent-posts
 * list below. Both come from KV at request time — see
 * `src/index.ts` for the route handler that joins them.
 *
 * Lives in the starter (not the runtime template registry) because
 * the home page joins data from two collections; the publish
 * pipeline registers per-collection templates and doesn't carry
 * cross-collection composition logic.
 */
export interface HomeContext {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly home: { title: string; intro?: string; body: string };
  readonly recentPosts: ReadonlyArray<Entry>;
}

export function homeTemplate(ctx: HomeContext): string {
  const { site, locale, home, recentPosts } = ctx;
  const tree = (
    <html lang={locale || site.canonicalLocale || "en"}>
      <head>
        <meta charSet="utf-8" />
        <title>{`${home.title} — ${site.brand}`}</title>
        <meta name="description" content={home.intro ?? site.description ?? ""} />
      </head>
      <body>
        <header>
          <a href={`/${locale}`}>{site.brand}</a>
          <nav>
            <a href={`/${locale}/posts`}>Posts</a>
            <a href={`/${locale}/pages/about`}>About</a>
            <a href={`/${locale}/pages/contact`}>Contact</a>
          </nav>
        </header>
        <main>
          <section>
            <h1>{home.title}</h1>
            {home.intro ? <p>{home.intro}</p> : null}
            <pre style="white-space: pre-wrap; font-family: inherit;">{home.body}</pre>
          </section>
          {recentPosts.length > 0 ? (
            <section>
              <h2>Recent posts</h2>
              <ul>
                {recentPosts.map((e) => {
                  const data = e.data as { slug?: string; title?: string };
                  const href = `/${locale}/posts/${data.slug ?? e.id}`;
                  return (
                    <li>
                      <a href={href}>{data.title ?? data.slug ?? e.id}</a>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </main>
      </body>
    </html>
  );
  return String(tree);
}

/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { marked } from "marked";
import type { Entry, SiteConfig } from "@aotter/mantle-spec";
import { Layout } from "./components/Layout.js";

const markedOptions = { gfm: true, breaks: false } as const;

const HEADINGS: Record<string, { eyebrow: string; recent: string }> = {
  en: { eyebrow: "the dispatch", recent: "Recent posts" },
  "zh-tw": { eyebrow: "近作", recent: "最新文章" },
};

function excerpt(body: string | undefined): string {
  if (!body) return "";
  const first = body.split(/\n+/).find((l) => l.trim().length > 0) ?? "";
  return first.length > 160 ? first.slice(0, 157) + "…" : first;
}

/**
 * Home page template. Renders the `pages` row with `slug = "home"` as
 * the hero, then a recent-posts list. Both come from KV / runtime at
 * request time — see `src/index.ts` for the route handler that joins
 * them.
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
  const heading = HEADINGS[locale.toLowerCase()] ?? HEADINGS.en!;
  const heroBody = home.body ? (marked.parse(home.body, markedOptions) as string) : "";
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${home.title} — ${site.brand}`}
      description={home.intro ?? site.description}
      current="home"
    >
      <section class="hero">
        <div class="eyebrow">{heading.eyebrow}</div>
        <h1>{home.title}</h1>
        {home.intro ? <p class="intro">{home.intro}</p> : null}
        <div class="body">{raw(heroBody)}</div>
      </section>
      {recentPosts.length > 0 ? (
        <section>
          <h2>{heading.recent}</h2>
          <ul class="entry-list">
            {recentPosts.map((e) => {
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
        </section>
      ) : null}
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

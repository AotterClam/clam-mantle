/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { Entry, SiteConfig } from "@aotter/mantle-spec";
import { Layout } from "./components/Layout.js";
import { bundleFor } from "../i18n/index.js";
import { excerpt, isoDate, renderMarkdown } from "./utils.js";

export interface HomeContext {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly home: { title: string; intro?: string; body: string };
  readonly recentPosts: ReadonlyArray<Entry>;
}

export function homeTemplate(ctx: HomeContext): string {
  const { site, locale, home, recentPosts } = ctx;
  const t = bundleFor(locale).home;
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${home.title} — ${site.brand}`}
      description={home.intro ?? site.description}
      current="home"
    >
      <section class="hero">
        <div class="eyebrow">{t.eyebrow}</div>
        <h1>{home.title}</h1>
        {home.intro ? <p class="intro">{home.intro}</p> : null}
        <div class="body">{raw(renderMarkdown(home.body))}</div>
      </section>
      {recentPosts.length > 0 ? (
        <section>
          <h2>{t.recent}</h2>
          <ul class="entry-list">
            {recentPosts.map((e) => {
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
        </section>
      ) : null}
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

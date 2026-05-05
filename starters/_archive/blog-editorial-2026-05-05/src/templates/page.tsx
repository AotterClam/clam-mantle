/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import type { EntryContext } from "@aotter/mantle-runtime";
import { Layout } from "./components/Layout.js";
import { renderMarkdown } from "./utils.js";

const NAV_HINTS: Record<string, "about" | "contact" | undefined> = {
  about: "about",
  contact: "contact",
};

export function pageTemplate(ctx: EntryContext): string {
  const { entry, site, seo } = ctx;
  const data = entry.data as {
    slug?: string;
    title?: string;
    intro?: string;
    body?: string;
    locale?: string;
  };
  const locale = data.locale ?? site.canonicalLocale ?? "en";
  const title = data.title ?? data.slug ?? "Untitled";
  const current = NAV_HINTS[(data.slug ?? "").toLowerCase()];
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${title} — ${site.brand}`}
      description={data.intro ?? site.description}
      current={current}
      seo={seo}
    >
      <article>
        <header class="post-meta">
          <h1>{title}</h1>
          {data.intro ? <p class="meta">{data.intro}</p> : null}
        </header>
        <div class="post-body">{raw(renderMarkdown(data.body))}</div>
      </article>
    </Layout>
  );
  return String(tree);
}

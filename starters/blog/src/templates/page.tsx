/** @jsxImportSource hono/jsx */
import { raw } from "hono/html";
import { marked } from "marked";
import type { EntryContext } from "@aotter/mantle-runtime";
import { Layout } from "./components/Layout.js";

const markedOptions = { gfm: true, breaks: false } as const;

const NAV_HINTS: Record<string, "about" | "contact" | undefined> = {
  about: "about",
  contact: "contact",
};

/**
 * Static-page template (about, contact, privacy, etc.). No cover
 * image, no publish timestamp, no drop cap by default — just title +
 * intro + body. Slugs `about` / `contact` opt into the matching nav
 * highlight.
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
  const locale = data.locale ?? site.canonicalLocale ?? "en";
  const title = data.title ?? data.slug ?? "Untitled";
  const bodyHtml = data.body ? (marked.parse(data.body, markedOptions) as string) : "";
  const current = NAV_HINTS[(data.slug ?? "").toLowerCase()];
  const tree = (
    <Layout
      site={site}
      locale={locale}
      title={`${title} — ${site.brand}`}
      description={data.intro ?? site.description}
      current={current}
    >
      <article>
        <header class="post-meta">
          <h1>{title}</h1>
          {data.intro ? <p class="meta">{data.intro}</p> : null}
        </header>
        <div class="post-body">{raw(bodyHtml)}</div>
      </article>
    </Layout>
  );
  return "<!doctype html>" + String(tree);
}

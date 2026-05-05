import type { Entry } from "@aotter/mantle-spec";

/**
 * Single source of truth for the public-route shape of each storage
 * collection. Hono routes (`src/index.ts`) and the sitemap pathFor
 * mapper read from here so a rename / restructure stays in one place.
 *
 * Returning `null` means "this collection has no public URL" — used
 * for the language-neutral parents (`posts`, `pages`) which only
 * surface via their per-locale child collections.
 */
export function publicPathFor(entry: Entry): string | null {
  const data = entry.data as { slug?: string };
  const slug = data.slug;
  const locale = entry.locale?.toLowerCase();
  if (!slug || !locale) return null;
  if (entry.collection === "post-translations") return `/${locale}/posts/${slug}`;
  if (entry.collection === "page-translations") {
    if (slug === "home") return `/${locale}`;
    return `/${locale}/pages/${slug}`;
  }
  return null;
}

import { createPublicPathResolver, type PublicPathResolver } from "@aotterclam/clam-cms-runtime";

/**
 * The starter's collection→URL routing table. Single source of truth
 * for both the request router (`mountPublicRoutes`) and outbound URL
 * emission (sitemap, hreflang, SEO canonical) — change a segment here
 * and every surface follows.
 *
 * Returning `null` (segment: null) for a collection means "this
 * collection has no public URL" — used for the language-neutral
 * parents (`posts`, `pages`) which only surface via their per-locale
 * children. Schemas without an entry here keep working; they just
 * don't appear in the sitemap or get hreflang siblings.
 */
export const PUBLIC_PATH_RESOLVER: PublicPathResolver = createPublicPathResolver({
  collectionRoutes: {
    "post-translations": { segment: "posts" },
    "page-translations": { segment: "pages", homeSlug: "home" },
  },
});

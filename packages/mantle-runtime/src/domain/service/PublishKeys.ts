import { toUrlLocale, type Entry } from "@aotter/mantle-spec";

/**
 * KV key derivation. Centralised so the publish pipeline (writer) and
 * the public router (reader) agree on one shape; changing the layout
 * is a single-file edit.
 *
 *   - `entry:html:{locale}/{collection}/{slug}` — pre-rendered HTML
 *   - `entry:md:{locale}/{collection}/{slug}`   — markdown mirror
 *   - `list:html:{locale}/{collection}`         — collection index
 *   - `llms:{locale}`                            — /{locale}/llms.txt
 *   - `llms:root`                                — /llms.txt (cross-locale aggregate)
 *
 * Non-localized entries use empty-string locale (`entry:html:/posts/abc`).
 * The root /llms.txt uses the explicit `:root` suffix instead of an
 * empty one because `wrangler kv bulk put` silently drops keys ending
 * in `:` (caught in CI on commit 93c10ef).
 *
 * Pure path math — no I/O. Lives in `domain/service/` so any layer
 * can call it without dragging an adapter dep.
 */
export function entrySlug(entry: { id: string; data: Record<string, unknown> }): string {
  const fromData = entry.data["slug"];
  if (typeof fromData === "string" && /^[a-z0-9][a-z0-9-]*$/.test(fromData)) {
    return fromData;
  }
  return entry.id;
}

export function entryHtmlKey(entry: Entry): string {
  const slug = entrySlug(entry);
  const locale = entry.locale ? toUrlLocale(entry.locale) : "";
  return `entry:html:${locale}/${entry.collection}/${slug}`;
}

export function entryMarkdownKey(entry: Entry): string {
  const slug = entrySlug(entry);
  const locale = entry.locale ? toUrlLocale(entry.locale) : "";
  return `entry:md:${locale}/${entry.collection}/${slug}`;
}

export function listHtmlKey(collection: string, locale: string): string {
  const urlLocale = locale ? locale.toLowerCase() : "";
  return `list:html:${urlLocale}/${collection}`;
}

export function llmsTxtKey(locale: string): string {
  return `llms:${locale ? locale.toLowerCase() : "root"}`;
}

export function entryPublicPath(entry: Entry): string {
  const slug = entrySlug(entry);
  if (entry.locale) return `/${toUrlLocale(entry.locale)}/${entry.collection}/${slug}`;
  return `/${entry.collection}/${slug}`;
}

import type { ContentState, Entry, SchemaManifest } from "@aotter/mantle-spec";
import type { DatabaseDriver } from "../port/DatabaseDriver.js";
import { readEntryByDataField } from "./PublishedEntries.js";

/**
 * `joinParentIfTranslation` — implements ADR-0010's promise that
 * "the public render path joins this Schema to its parent on the
 * declared field." When `entry.collection` has a `translates.parent`
 * declaration, reads the parent entry and merges its data into the
 * child translation's data (translation wins on key conflicts), so
 * the renderer sees a single denormalized view.
 *
 * Why this lives here:
 *  - All 4 render paths (`RenderEntryLive`, `RenderListLive`,
 *    `PreviewEntry`, `HtmlPublishOrchestrator`) hit the same gap —
 *    they each read translation rows from D1 then pass them straight
 *    to `renderEntryHtml`. Without this join, fields that live on
 *    the parent (e.g. `posts.coverUrl`, `posts.authorId`,
 *    `posts.publishedAt`) never reach the template even though the
 *    template expects them in `entry.data`.
 *  - Templates already read from `entry.data.<field>` — keeping the
 *    join inside data preserves the template contract; no signature
 *    changes downstream.
 *
 * Status filter: parent must be in the same lifecycle bucket as the
 * child (typically "published"). If the parent is unpublished, the
 * `RequestPublishUseCase` already refuses to publish the translation
 * — so at render time a published translation always has a published
 * parent. But during preview the child can be draft; in that case
 * we look up parent without status filter (preview reads the most
 * recent parent regardless).
 */
export async function joinParentIfTranslation(
  db: DatabaseDriver,
  schemas: ReadonlyMap<string, SchemaManifest>,
  entry: Entry,
  options: { readonly parentStatus?: ContentState } = {},
): Promise<Entry> {
  const schema = schemas.get(entry.collection);
  const translates = schema?.spec.translates;
  if (!translates) return entry;

  const joinValue = entry.data[translates.on];
  if (typeof joinValue !== "string" || joinValue === "") return entry;

  const parent = await readEntryByDataField(db, {
    collection: translates.parent,
    field: translates.on,
    value: joinValue,
    locale: null,
    status: options.parentStatus,
  });
  if (!parent) return entry;

  return {
    ...entry,
    data: {
      ...parent.data,
      ...entry.data,
    },
  };
}

/** Batch helper for list paths. Maps each entry through
 *  `joinParentIfTranslation` in parallel. Safe to call on a list of
 *  non-translation entries — the function short-circuits when no
 *  `translates` declaration exists. */
export async function joinParentForList(
  db: DatabaseDriver,
  schemas: ReadonlyMap<string, SchemaManifest>,
  entries: readonly Entry[],
  options: { readonly parentStatus?: ContentState } = {},
): Promise<Entry[]> {
  return Promise.all(
    entries.map((entry) => joinParentIfTranslation(db, schemas, entry, options)),
  );
}

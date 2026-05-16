import type { ContentState, SiteConfig } from "@aotterclam/clam-mantle-spec";

/**
 * Request DTO for `PreviewEntryUseCase`. Looks up the entry,
 * preferring `statusOrder` left-to-right (default: draft → published
 * → archived); renders via the registered template; injects a
 * preview banner.
 */
export interface PreviewEntryRequest {
  readonly collection: string;
  readonly slug: string;
  readonly locale: string;
  readonly site: SiteConfig;
  /** Override the default fallback order. Empty array = no fallback;
   *  use the single-status RenderEntryLiveUseCase if you want one
   *  state only. */
  readonly statusOrder?: ReadonlyArray<ContentState>;
  /** Banner HTML appended just inside `<body>`. Caller composes the
   *  text — runtime doesn't own the localization. Defaults to a bare
   *  `Preview · {status} · {slug}` block when omitted. */
  readonly banner?: string;
}

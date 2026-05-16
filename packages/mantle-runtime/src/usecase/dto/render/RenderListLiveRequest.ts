import type { SiteConfig } from "@aotterclam/mantle-spec";

/**
 * Request DTO for `RenderListLiveUseCase` — renders a collection's
 * list page from current DB state on demand (no KV read).
 */
export interface RenderListLiveRequest {
  readonly collection: string;
  readonly locale: string;
  readonly site: SiteConfig;
}

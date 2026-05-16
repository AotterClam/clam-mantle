/**
 * Pagination clamps shared by the View REST surface (ADR-0012) and
 * `ListEntriesUseCase`. Pure functions; no I/O.
 *
 * Defaults / cap are runtime-internal — manifests don't see them.
 * `MAX_LIMIT` is the upper bound on what any caller can ask for in a
 * single round-trip; `View.spec.limit` may further narrow this on a
 * per-View basis (`clampShow` honours both).
 */
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

export function clampShow(show: number | undefined, viewLimit: number | undefined): number {
  const cap = clampLimit(viewLimit);
  if (typeof show !== "number" || !Number.isFinite(show) || show <= 0) return cap;
  return Math.min(Math.floor(show), cap);
}

export function clampPage(page: number | undefined): number {
  if (typeof page !== "number" || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

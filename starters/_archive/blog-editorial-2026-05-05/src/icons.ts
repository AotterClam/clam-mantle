/**
 * Tiny inline-SVG icon registry. v0.1: hand-authored 24×24 lucide-style
 * paths (https://lucide.dev/), monochrome, single stroke. Adding an
 * icon = add an entry to `PATHS` + extend the `IconName` union.
 *
 * Returns SVG markup as a string (templates inject via `raw()`). All
 * icons inherit `currentColor` for stroke so they follow the
 * surrounding text color, which keeps theme switching free.
 *
 * No runtime dep on `lucide` — a few icons don't justify dragging in
 * the package. If the set grows past ~20 icons, swap for
 * `lucide-static` and re-export through this module so callers don't
 * change.
 */
export type IconName =
  | "sun"
  | "moon"
  | "monitor"
  | "globe"
  | "chevron-down"
  | "check"
  | "menu"
  | "x";

const PATHS: Record<IconName, string> = {
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>`,
  moon: `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`,
  monitor: `<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>`,
  globe: `<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>`,
  "chevron-down": `<polyline points="6 9 12 15 18 9"/>`,
  check: `<polyline points="20 6 9 17 4 12"/>`,
  menu: `<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>`,
  x: `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
};

const DEFAULT_STROKE = 2;
const HEAVIER_STROKE_FOR: Partial<Record<IconName, number>> = {
  check: 2.5,
};

export interface IconOptions {
  readonly size?: number;
  readonly strokeWidth?: number;
}

export function icon(name: IconName, options: IconOptions = {}): string {
  const size = options.size ?? 16;
  const stroke = options.strokeWidth ?? HEAVIER_STROKE_FOR[name] ?? DEFAULT_STROKE;
  return (
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}"` +
    ` fill="none" stroke="currentColor" stroke-width="${stroke}"` +
    ` stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    PATHS[name] +
    `</svg>`
  );
}

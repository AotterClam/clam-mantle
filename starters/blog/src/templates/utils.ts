import { marked } from "marked";

const MARKDOWN_OPTIONS = { gfm: true, breaks: false } as const;

export function renderMarkdown(body: string | undefined): string {
  if (!body) return "";
  return marked.parse(body, MARKDOWN_OPTIONS) as string;
}

export function isoDate(dt: number | string | null | undefined): string {
  if (dt == null) return "";
  return new Date(dt).toISOString().slice(0, 10);
}

export function excerpt(body: string | undefined, max = 160): string {
  if (!body) return "";
  const first = body.split(/\n+/).find((l) => l.trim().length > 0) ?? "";
  return first.length > max ? first.slice(0, max - 3) + "…" : first;
}

/**
 * Pick the locale-keyed entry from a copy table. Keys are the URL
 * locale form (e.g. `"zh-tw"` for `zh-TW`); falls back to `en` if the
 * requested locale has no entry. The `en` fallback is asserted with
 * `!` because every starter copy table is required to declare it.
 */
export function pickCopy<T>(table: Record<string, T>, locale: string): T {
  return table[locale.toLowerCase()] ?? table.en!;
}

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


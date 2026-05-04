import type { Entry, SiteConfig } from "@aotter/mantle-spec";

/**
 * Built-in markdown serializer. Fixed format, applied to every entry
 * whose Schema produces a `content` field. Intentionally not user-
 * customizable — agents that consume `.md` mirrors and `/llms.txt`
 * benefit from a predictable site-wide shape.
 *
 *   ---
 *   title: ...
 *   description: ...
 *   slug: ...
 *   locale: ...
 *   publishedAt: ...
 *   ---
 *
 *   # <title>
 *
 *   > <description>
 *
 *   <content>
 *
 * Entries without a `content` field skip the `.md` mirror.
 *
 * Pure transformation — no I/O. Lives in `domain/service/`.
 */
export function serializeEntryAsMarkdown(entry: Entry): string | null {
  const data = entry.data;
  const content = typeof data["content"] === "string" ? data["content"] : null;
  if (content == null) return null;

  const fm: Array<[string, string]> = [];
  for (const k of ["title", "description", "slug", "locale", "publishedAt"] as const) {
    const v = k === "locale" ? entry.locale : data[k];
    if (typeof v === "string" && v.length > 0) fm.push([k, v]);
  }

  const title = (data["title"] as string | undefined) ?? entry.id;
  const description = data["description"] as string | undefined;

  let out = "---\n";
  for (const [k, v] of fm) out += `${k}: ${yamlScalar(v)}\n`;
  out += "---\n\n";
  out += `# ${title}\n\n`;
  if (description) out += `> ${description}\n\n`;
  out += content;
  if (!content.endsWith("\n")) out += "\n";
  return out;
}

/**
 * Per-locale `/llms.txt` index. One section per collection, one bullet
 * per entry. The shape follows the llms.txt convention (Howard, 2024-11)
 * so agent consumers can rely on a stable structure.
 */
export function serializeLlmsTxt(args: {
  readonly site: SiteConfig;
  readonly locale: string;
  readonly entriesByCollection: ReadonlyMap<string, readonly Entry[]>;
}): string {
  const { site, locale, entriesByCollection } = args;
  const urlLocale = locale.toLowerCase();
  let out = `# ${site.title}\n\n`;
  if (site.description) out += `> ${site.description}\n\n`;
  if (locale) out += `Locale: ${locale}\n\n`;
  for (const [collection, entries] of entriesByCollection) {
    if (entries.length === 0) continue;
    out += `## ${collection}\n\n`;
    for (const e of entries) {
      const data = e.data;
      if (typeof data["content"] !== "string") continue;
      const title = (data["title"] as string | undefined) ?? e.id;
      const slug = (data["slug"] as string | undefined) ?? e.id;
      const desc = (data["description"] as string | undefined) ?? "";
      const localePrefix = urlLocale ? `/${urlLocale}` : "";
      const url = `${site.origin}${localePrefix}/${collection}/${slug}.md`;
      out += desc ? `- [${title}](${url}): ${desc}\n` : `- [${title}](${url})\n`;
    }
    out += "\n";
  }
  return out;
}

function yamlScalar(s: string): string {
  if (/^[A-Za-z0-9._/-][\w. /:-]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)) {
    return s;
  }
  return JSON.stringify(s);
}

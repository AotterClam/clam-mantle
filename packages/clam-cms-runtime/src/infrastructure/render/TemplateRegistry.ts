import type { Entry, SiteConfig } from "@aotterclam/clam-cms-spec";

/**
 * Render-pipeline types + consumer-supplied template registry.
 *
 * The runtime stays string-typed — templates return complete HTML
 * body strings (no doctype prefix; the publish pipeline adds it) so
 * the runtime carries no JSX dependency. Consumers using JSX in
 * their public surface (Hono + hono/jsx) call their JSX → string
 * function before the template returns.
 *
 * Schemas without a registered entry/list template still get
 * markdown / `llms.txt` mirrors — the HTML surfaces are simply
 * skipped (per ADR-0009-extended: the SDK ships zero opinionated
 * templates).
 */
export interface EntryContext {
  readonly entry: Entry;
  readonly site: SiteConfig;
}

export interface ListContext {
  readonly collection: string;
  readonly locale: string;
  readonly entries: readonly Entry[];
  readonly site: SiteConfig;
}

export type EntryTemplate = (ctx: EntryContext) => string;
export type ListTemplate = (ctx: ListContext) => string;

export class TemplateRegistry {
  private readonly entries = new Map<string, EntryTemplate>();
  private readonly lists = new Map<string, ListTemplate>();

  registerEntryTemplate(collection: string, t: EntryTemplate): void {
    this.entries.set(collection, t);
  }

  registerListTemplate(collection: string, t: ListTemplate): void {
    this.lists.set(collection, t);
  }

  getEntryTemplate(collection: string): EntryTemplate | undefined {
    return this.entries.get(collection);
  }

  getListTemplate(collection: string): ListTemplate | undefined {
    return this.lists.get(collection);
  }
}

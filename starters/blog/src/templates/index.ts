import { TemplateRegistry } from "@aotterclam/clam-cms-runtime";
import { postTemplate } from "./post.js";
import { postListTemplate } from "./postList.js";
import { pageTemplate } from "./page.js";
import { homeTemplate } from "./home.js";

export { postTemplate, postListTemplate, pageTemplate, homeTemplate };

/**
 * Bind templates to their target collections. The render pipeline
 * looks them up by `Schema.metadata.name`; collections without a
 * registered template still get markdown / `llms.txt` mirrors but
 * skip HTML.
 *
 * `homeTemplate` is NOT registered here — the home page composes a
 * `pages` row (slug=home) with a recent-posts list from
 * `post-translations`, which crosses collections and can't be
 * expressed in the per-Schema publish pipeline. The starter's
 * `GET /{locale}/` handler calls `homeTemplate` directly at request
 * time after fetching both pieces from KV.
 */
export function buildTemplates(): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.registerEntryTemplate("post-translations", postTemplate);
  registry.registerListTemplate("post-translations", postListTemplate);
  registry.registerEntryTemplate("page-translations", pageTemplate);
  return registry;
}

import { TemplateRegistry } from "@aotter/mantle-runtime";
import { postTemplate } from "./post.js";
import { postListTemplate } from "./postList.js";
import { pageTemplate } from "./page.js";
import { homeTemplate } from "./home.js";
import { notFoundTemplate } from "./notFound.js";

export {
  postTemplate,
  postListTemplate,
  pageTemplate,
  homeTemplate,
  notFoundTemplate,
};

/**
 * Bind templates to their target collections. The render pipeline
 * looks them up by `Schema.metadata.name`; collections without a
 * registered template still get markdown / `llms.txt` mirrors but
 * skip HTML.
 *
 * `homeTemplate` and `notFoundTemplate` are NOT registered here:
 * `homeTemplate` composes two collections (page + recent-posts), and
 * `notFoundTemplate` is request-time only. Both are called directly
 * from the worker route handlers.
 */
export function buildTemplates(): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.registerEntryTemplate("post-translations", postTemplate);
  registry.registerListTemplate("post-translations", postListTemplate);
  registry.registerEntryTemplate("page-translations", pageTemplate);
  return registry;
}

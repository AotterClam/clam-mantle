import { TemplateRegistry } from "@aotter/mantle-runtime";
import { postTemplate } from "./post.js";
import { postListTemplate } from "./postList.js";
import { pageTemplate } from "./page.js";
import { homeTemplate } from "./home.js";
import { notFoundTemplate } from "./notFound.js";
import { contactTemplate } from "./contact.js";

export {
  postTemplate,
  postListTemplate,
  pageTemplate,
  homeTemplate,
  notFoundTemplate,
  contactTemplate,
};

/**
 * Bind templates to their target collections. The render pipeline
 * looks them up by `Schema.metadata.name`; collections without a
 * registered template still get markdown / `llms.txt` mirrors but
 * skip HTML.
 *
 * `homeTemplate`, `notFoundTemplate`, and `contactTemplate` are NOT
 * registered here — all three are request-time only:
 *   - homeTemplate composes two collections (page + recent-posts);
 *   - notFoundTemplate runs on KV-miss + global notFound;
 *   - contactTemplate needs the live Turnstile site key from env.
 * Each is called directly from a worker route handler.
 */
export function buildTemplates(): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.registerEntryTemplate("post-translations", postTemplate);
  registry.registerListTemplate("post-translations", postListTemplate);
  registry.registerEntryTemplate("page-translations", pageTemplate);
  return registry;
}

import { TemplateRegistry } from "@aotter/mantle-runtime";
import { postTemplate } from "./post.js";
import { postListTemplate } from "./postList.js";

/**
 * Bind templates to their target collections. The render pipeline
 * looks them up by `Schema.metadata.name`; collections without a
 * registered template still get markdown / `llms.txt` mirrors but
 * skip HTML.
 */
export function buildTemplates(): TemplateRegistry {
  const registry = new TemplateRegistry();
  registry.registerEntryTemplate("post-translations", postTemplate);
  registry.registerListTemplate("post-translations", postListTemplate);
  return registry;
}

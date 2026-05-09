import { TemplateRegistry } from "@aotter/mantle-runtime";
import overrides from "../../theme/index.js";
import { postTemplate as basePost } from "./post.js";
import { postListTemplate as basePostList } from "./postList.js";
import { pageTemplate as basePage } from "./page.js";
import { homeTemplate as baseHome } from "./home.js";
import { notFoundTemplate as baseNotFound } from "./notFound.js";
import { contactTemplate as baseContact } from "./contact.js";

// Slot resolution: theme/index.ts overrides win, fall through to baseline.
export const postTemplate = overrides.templates?.post ?? basePost;
export const postListTemplate = overrides.templates?.postList ?? basePostList;
export const pageTemplate = overrides.templates?.page ?? basePage;
export const homeTemplate = overrides.templates?.home ?? baseHome;
export const notFoundTemplate = overrides.templates?.notFound ?? baseNotFound;
export const contactTemplate = overrides.templates?.contact ?? baseContact;

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

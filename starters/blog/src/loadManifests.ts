import { parseManifests, type Manifest } from "@aotterclam/clam-cms-spec";
// Wrangler's `[[rules]] type = "Text"` for `*.yaml` (see wrangler.toml)
// makes esbuild bundle these imports as inline string exports — the
// manifests travel with the worker code, no FS access at runtime.
import postsYaml from "../manifests/posts.yaml";
import postTranslationsYaml from "../manifests/post-translations.yaml";
import pagesYaml from "../manifests/pages.yaml";
import contactYaml from "../manifests/contact.yaml";

/**
 * Parse + validate the starter's manifests at module-load time. Throws
 * on parse failure so deploys fail fast — boot validation runs again
 * via `runtime.bootInit()` for cross-manifest checks (handler refs,
 * Trigger targets, locale invariants).
 */
export function loadManifests(): readonly Manifest[] {
  const result = parseManifests([
    postsYaml,
    postTranslationsYaml,
    pagesYaml,
    contactYaml,
  ]);
  if (result.diagnostics.length > 0) {
    const summary = result.diagnostics
      .map((d) => `  - [${d.code}] ${d.path}: ${d.message}`)
      .join("\n");
    throw new Error(`Manifest parse failed:\n${summary}`);
  }
  return result.manifests;
}

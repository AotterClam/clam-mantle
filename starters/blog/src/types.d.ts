/**
 * Wrangler bundles `*.yaml` imports as inline text via `[[rules]]
 * type = "Text"` in `wrangler.toml`. TS doesn't see esbuild's text
 * loader; declare the module shape so editor + typecheck both see
 * the imports as `string`.
 */
declare module "*.yaml" {
  const content: string;
  export default content;
}

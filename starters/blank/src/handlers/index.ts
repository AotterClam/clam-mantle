import type { AnyHandler } from "@aotterclam/clam-cms-runtime";

/**
 * Procedure handler registry. Empty for the headless starter — add
 * entries when your manifests declare Procedures with
 * `handler.kind: ref` and a matching `handler.ref` name.
 */
export function buildHandlers(): Readonly<Record<string, AnyHandler>> {
  return {};
}

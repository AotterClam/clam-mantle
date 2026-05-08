import { parseManifestsOrThrow, type Manifest } from "@aotter/mantle-spec";
import exampleYaml from "../manifests/example.yaml";

export function loadManifests(): readonly Manifest[] {
  return parseManifestsOrThrow([exampleYaml], { context: "starters/blank" });
}

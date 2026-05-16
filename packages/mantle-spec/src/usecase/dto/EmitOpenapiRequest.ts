import type { Manifest } from "../../domain/model/ManifestGrammar.js";

export interface EmitOpenapiRequest {
  readonly manifests: ReadonlyArray<Manifest>;
  readonly title: string;
  readonly version: string;
}

import type { Manifest } from "../../domain/model/ManifestGrammar.js";

export interface EmitTypesRequest {
  readonly manifests: ReadonlyArray<Manifest>;
  readonly namespace: string;
}

import type { Manifest } from "../../domain/model/ManifestGrammar.js";
import type { Diagnostic } from "../../kernel/diagnostic.js";

export interface IntrospectManifestsRequest {
  readonly manifests: ReadonlyArray<Manifest>;
  readonly parseErrors: ReadonlyArray<Diagnostic>;
}

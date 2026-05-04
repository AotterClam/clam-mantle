/**
 * Schema-atom internal types. The grammar lives in `../manifests/types.ts`
 * as a single source of truth (`JsonSchema`, custom keyword constants);
 * `json-schema-zod.ts`, `validator.ts`, and `ddl.ts` all consume it
 * through the re-exports below.
 */
export {
  type JsonSchema,
  CLAM_REF_KEYWORD,
  MCP_HINT_KEYWORD,
  CLAM_BIND_KEYWORD,
} from "../manifests/types.js";

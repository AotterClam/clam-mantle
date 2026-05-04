import { parseAllDocuments } from "yaml";
import {
  type Diagnostic,
  type DiagnosticCode,
  validateDiagnostic,
} from "../diagnostic.js";
import {
  API_VERSION,
  BUILTIN_OPS,
  LIFECYCLE_HOOKS,
  type AuthPredicate,
  type BuiltinOp,
  type FilterAst,
  type HttpMethod,
  type LifecycleHook,
  type Manifest,
  type ManifestKind,
  type ProcedureManifest,
  type SchemaManifest,
  type TriggerManifest,
  type ViewManifest,
} from "./types.js";

/**
 * Day-1 envelope-and-shape parser. Loop 1 (`mantle validate`) does the
 * cross-manifest checks (Trigger.target.procedure exists, View.from is a
 * Schema, etc.) — see ADR-0007 / `docs/authoring-contract.md`.
 *
 * Diagnostics emitted here are intentionally narrow: bad envelope,
 * structurally malformed spec, use of a DRAFT or v0.1.x-not-yet-shipped
 * key the v0.1.0 parser does not accept.
 *
 * Return shape is `{ manifests, diagnostics }`: parse-fatal docs are
 * skipped (manifest absent from `manifests`) and reported via a
 * `severity: "error"` diagnostic. Per ADR-0008 the caller (the CLI / boot
 * validator / consumer) routes diagnostics; we don't throw.
 *
 * Multi-doc YAML support per ADR-0001 § "Authoring shape" — one feature
 * per file, atoms separated by `---`.
 */

/**
 * Backwards-compat throwable carrier. Internal-only; the public API
 * is `parseManifests` returning `{ manifests, diagnostics }`. Held so
 * cross-schema validators that previously caught a typed error can be
 * ported incrementally.
 */
export class ManifestParseError extends Error {
  constructor(
    message: string,
    public readonly docIndex?: number,
    /** JSON Pointer into the manifest (e.g. `/spec/output`) — included
     *  in the diagnostic `path` when the CLI surfaces this error so
     *  consumers can navigate to the exact field, not just the doc. */
    public readonly pointer?: string,
    public readonly code: DiagnosticCode = "INVALID_MANIFEST_ENVELOPE",
  ) {
    super(docIndex != null ? `[doc ${docIndex}] ${message}` : message);
    this.name = "ManifestParseError";
  }
}

const KNOWN_KINDS: ReadonlySet<ManifestKind> = new Set([
  "Schema",
  "View",
  "Procedure",
  "Trigger",
]);

/** v0.1.0 parser accepts `http` only on the wire. `lifecycle` is
 *  v0.1.x-committed (rejected with the fine-grained
 *  LIFECYCLE_NOT_IN_V010 code, not generic DRAFT_KEY_USED). The
 *  speculative source kinds (`mcp`, `cron`, `queue`) are rejected with
 *  DRAFT_KEY_USED. See ADR-0001 § "What's DRAFT". */
const V01_TRIGGER_SOURCE_KINDS: ReadonlySet<string> = new Set(["http"]);
const V01X_RESERVED_TRIGGER_SOURCE_KINDS: ReadonlySet<string> = new Set(["lifecycle"]);
const DRAFT_TRIGGER_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "mcp",
  "cron",
  "queue",
]);

const V01_HTTP_METHODS: ReadonlySet<HttpMethod> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

/** v0.1.0 ships `ref` only. `builtin` is v0.1.x-committed; the parser
 *  rejects it today with HANDLER_BUILTIN_NOT_IN_V010 (specific, not the
 *  generic DRAFT_KEY_USED). The structural validators below are still
 *  present so once builtin promotes to v0.1.0+ the only change needed
 *  is dropping the rejection branch. */
const V01_HANDLER_KINDS: ReadonlySet<string> = new Set(["ref"]);
const V01X_RESERVED_HANDLER_KINDS: ReadonlySet<string> = new Set(["builtin"]);
const V01_BUILTIN_OPS: ReadonlySet<BuiltinOp> = new Set(BUILTIN_OPS);
const V01_LIFECYCLE_HOOKS: ReadonlySet<LifecycleHook> = new Set(LIFECYCLE_HOOKS);
const V01_HOOK_ERROR_POLICIES: ReadonlySet<string> = new Set(["abort", "continue"]);
const V01_LIFECYCLE_MODES: ReadonlySet<string> = new Set(["simple", "editorial"]);

/** Result of `parseManifests`. */
export interface ParseManifestsResult {
  readonly manifests: Manifest[];
  readonly diagnostics: Diagnostic[];
}

/**
 * Parse YAML text (single doc, multi-doc, or a list of either) into typed
 * manifests + diagnostics. The input form is whatever the caller has —
 * a raw `string` from `fs.readFile`, or an array of strings from a glob
 * walk. Per ADR-0001 multi-doc YAML support, `---` separators inside one
 * string yield one manifest per doc.
 */
export function parseManifests(input: string | readonly string[]): ParseManifestsResult {
  const inputs = typeof input === "string" ? [input] : input;
  const manifests: Manifest[] = [];
  const diagnostics: Diagnostic[] = [];
  let globalDocIndex = 0;
  for (const yamlText of inputs) {
    parseOneStream(yamlText, globalDocIndex, manifests, diagnostics);
    // Bump the global doc index by however many docs were in this stream
    // so that diagnostics across multiple input strings stay
    // unambiguously addressable.
    const docs = parseAllDocuments(yamlText, { merge: false });
    globalDocIndex += docs.length;
  }
  return { manifests, diagnostics };
}

function parseOneStream(
  yamlText: string,
  baseDocIndex: number,
  manifests: Manifest[],
  diagnostics: Diagnostic[],
): void {
  const docs = parseAllDocuments(yamlText, { merge: false });
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;
    const docIndex = baseDocIndex + i;
    if (doc.errors.length > 0) {
      diagnostics.push(
        validateDiagnostic({
          code: "INVALID_MANIFEST_ENVELOPE",
          severity: "error",
          path: pointerFor(docIndex, "/"),
          message: `[doc ${docIndex}] YAML parse error: ${doc.errors.map((e) => e.message).join("; ")}`,
        }),
      );
      continue;
    }
    const value = doc.toJS({ maxAliasCount: -1 });
    if (value == null) continue;
    try {
      manifests.push(validateEnvelope(value, docIndex));
    } catch (e) {
      if (e instanceof ManifestParseError) {
        diagnostics.push(
          validateDiagnostic({
            code: e.code,
            severity: "error",
            path: pointerFor(docIndex, e.pointer ?? "/"),
            message: e.message,
          }),
        );
      } else {
        diagnostics.push(
          validateDiagnostic({
            code: "INVALID_MANIFEST_ENVELOPE",
            severity: "error",
            path: pointerFor(docIndex, "/"),
            message:
              e instanceof Error
                ? `[doc ${docIndex}] ${e.message}`
                : `[doc ${docIndex}] unknown parse error`,
          }),
        );
      }
    }
  }
}

function pointerFor(docIndex: number, jsonPointer: string): string {
  // Without a source map (no file path is supplied to parseManifests),
  // fall back to a synthetic `manifest:doc/<index>` URI. Boot/CLI layers
  // that do have a file path should remap via `manifestPath` in
  // diagnose.ts before surfacing.
  const ptr = jsonPointer.startsWith("/") ? jsonPointer : `/${jsonPointer}`;
  return `manifest:doc/${docIndex}#${ptr}`;
}

function validateEnvelope(raw: unknown, docIndex: number): Manifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ManifestParseError("manifest must be a YAML mapping", docIndex);
  }
  const m = raw as Record<string, unknown>;

  if (m["apiVersion"] !== API_VERSION) {
    throw new ManifestParseError(
      `apiVersion must be "${API_VERSION}"; got ${JSON.stringify(m["apiVersion"])}`,
      docIndex,
      "/apiVersion",
    );
  }
  const kind = m["kind"];
  if (typeof kind !== "string" || !KNOWN_KINDS.has(kind as ManifestKind)) {
    throw new ManifestParseError(
      `kind must be one of ${[...KNOWN_KINDS].join(", ")}; got ${JSON.stringify(kind)}`,
      docIndex,
      "/kind",
    );
  }
  const meta = m["metadata"];
  if (typeof meta !== "object" || meta === null) {
    throw new ManifestParseError("metadata is required and must be a mapping", docIndex, "/metadata");
  }
  const name = (meta as Record<string, unknown>)["name"];
  if (typeof name !== "string" || name.length === 0) {
    throw new ManifestParseError("metadata.name is required (non-empty string)", docIndex, "/metadata/name");
  }
  const spec = m["spec"];
  if (typeof spec !== "object" || spec === null) {
    throw new ManifestParseError("spec is required and must be a mapping", docIndex, "/spec");
  }

  switch (kind) {
    case "Schema":
      return validateSchemaSpec(raw as SchemaManifest, docIndex);
    case "View":
      return validateViewSpec(raw as ViewManifest, docIndex);
    case "Procedure":
      return validateProcedureSpec(raw as ProcedureManifest, docIndex);
    case "Trigger":
      return validateTriggerSpec(raw as TriggerManifest, docIndex);
    default:
      // Unreachable thanks to the KNOWN_KINDS check above.
      throw new ManifestParseError(`unhandled kind ${kind}`, docIndex);
  }
}

function validateSchemaSpec(m: SchemaManifest, idx: number): SchemaManifest {
  const s = m.spec as unknown as Record<string, unknown>;
  if (typeof s["schema"] !== "object" || s["schema"] === null) {
    throw new ManifestParseError("Schema.spec.schema is required", idx, "/spec/schema");
  }
  // ADR-0010 / authoring contract: Schema.spec.title is the admin
  // UI's user-facing label. AI authors must populate it in the user's
  // primary language; the SPA shows this everywhere (sidebar, breadcrumb,
  // entry list header) instead of the bare metadata.name.
  if (typeof s["title"] !== "string" || (s["title"] as string).length === 0) {
    throw new ManifestParseError(
      "Schema.spec.title is required (non-empty string). It's the admin UI label — populate it in the user's primary language, not the bare metadata.name.",
      idx,
      "/spec/title",
    );
  }
  if ("localized" in s && typeof s["localized"] !== "boolean") {
    throw new ManifestParseError(
      `Schema.spec.localized must be a boolean; got ${JSON.stringify(s["localized"])}`,
      idx,
      "/spec/localized",
    );
  }
  if ("lifecycle" in s) {
    const lc = s["lifecycle"];
    if (typeof lc !== "string" || !V01_LIFECYCLE_MODES.has(lc)) {
      throw new ManifestParseError(
        `Schema.spec.lifecycle must be one of ${[...V01_LIFECYCLE_MODES].join(", ")}; got ${JSON.stringify(lc)}`,
        idx,
        "/spec/lifecycle",
      );
    }
  }
  if ("translates" in s && s["translates"] != null) {
    const t = s["translates"];
    if (typeof t !== "object" || Array.isArray(t)) {
      throw new ManifestParseError(
        "Schema.spec.translates must be an object { parent, on }",
        idx,
        "/spec/translates",
      );
    }
    const tr = t as Record<string, unknown>;
    if (typeof tr["parent"] !== "string" || (tr["parent"] as string).length === 0) {
      throw new ManifestParseError(
        "Schema.spec.translates.parent is required (non-empty Schema name)",
        idx,
        "/spec/translates/parent",
      );
    }
    if (typeof tr["on"] !== "string" || (tr["on"] as string).length === 0) {
      throw new ManifestParseError(
        "Schema.spec.translates.on is required (non-empty field name)",
        idx,
        "/spec/translates/on",
      );
    }
    // `translates` is meaningful only on a localized child Schema.
    // The cross-Schema check (parent exists, join field declared in
    // both schemas) lands in the validate / boot phase. Here we just
    // assert the local invariant: non-`localized: true` + `translates`
    // is structurally a mistake.
    if (s["localized"] !== true) {
      throw new ManifestParseError(
        "Schema.spec.translates requires Schema.spec.localized: true (a non-localized translation table is meaningless)",
        idx,
        "/spec/translates",
      );
    }
  }
  // DRAFT keys at this level — `policies` covers `visible` / `readable` /
  // `writable` / `owner` rules from ADR-0001 § "What's DRAFT" / Schema.
  if ("policies" in s) {
    throw new ManifestParseError(
      "Schema.spec.policies is DRAFT (see ADR-0001 § \"What's DRAFT\" / Schema); not supported in v0.1",
      idx,
      "/spec/policies",
      "DRAFT_KEY_USED",
    );
  }
  return m;
}

function validateViewSpec(m: ViewManifest, idx: number): ViewManifest {
  const s = m.spec as unknown as Record<string, unknown>;
  if (typeof s["from"] !== "string" || (s["from"] as string).length === 0) {
    throw new ManifestParseError("View.spec.from is required (non-empty string)", idx, "/spec/from");
  }
  if ("filter" in s && s["filter"] != null) {
    validateFilterAst(s["filter"], idx, "View.spec.filter");
  }
  // DRAFT keys: reject so authors who reach for them get a clear message
  // pointing at the future-grammar appendix.
  for (const draft of ["recursive", "params", "gatedBy", "join", "policies"] as const) {
    if (draft in s) {
      throw new ManifestParseError(
        `View.spec.${draft} is DRAFT (see ADR-0001 § "What's DRAFT" / View); not supported in v0.1`,
        idx,
        `/spec/${draft}`,
        "DRAFT_KEY_USED",
      );
    }
  }
  return m;
}

function validateFilterAst(node: unknown, idx: number, path: string): void {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    throw new ManifestParseError(`${path} must be an object node (eq | and | or)`, idx);
  }
  const n = node as Record<string, unknown>;
  const keys = Object.keys(n);
  if (keys.length !== 1) {
    throw new ManifestParseError(
      `${path} must have exactly one key (eq | and | or); got ${JSON.stringify(keys)}`,
      idx,
    );
  }
  const op = keys[0]!;
  if (op === "eq") {
    const eq = n["eq"];
    if (typeof eq !== "object" || eq === null) {
      throw new ManifestParseError(`${path}.eq must be an object`, idx);
    }
    const e = eq as Record<string, unknown>;
    if (typeof e["field"] !== "string" || (e["field"] as string).length === 0) {
      throw new ManifestParseError(`${path}.eq.field is required (non-empty string)`, idx);
    }
    if (!("value" in e)) {
      throw new ManifestParseError(`${path}.eq.value is required`, idx);
    }
    return;
  }
  if (op === "and" || op === "or") {
    const arr = n[op];
    if (!Array.isArray(arr) || arr.length === 0) {
      throw new ManifestParseError(`${path}.${op} must be a non-empty array`, idx);
    }
    for (let i = 0; i < arr.length; i++) {
      validateFilterAst(arr[i], idx, `${path}.${op}[${i}]`);
    }
    return;
  }
  // DRAFT operators (contains / not / in / like) live as future grammar.
  const draftOps = new Set(["contains", "not", "in", "like"]);
  if (draftOps.has(op)) {
    throw new ManifestParseError(
      `${path} operator '${op}' is DRAFT (see ADR-0001 § "What's DRAFT" / View); not supported in v0.1`,
      idx,
      undefined,
      "DRAFT_KEY_USED",
    );
  }
  throw new ManifestParseError(
    `${path} operator must be one of eq, and, or; got '${op}'`,
    idx,
  );
}

function validateProcedureSpec(m: ProcedureManifest, idx: number): ProcedureManifest {
  const s = m.spec as unknown as Record<string, unknown>;
  if (typeof s["input"] !== "object" || s["input"] === null) {
    throw new ManifestParseError("Procedure.spec.input is required (JSON Schema)", idx, "/spec/input");
  }
  if (typeof s["output"] !== "object" || s["output"] === null) {
    throw new ManifestParseError("Procedure.spec.output is required (JSON Schema)", idx, "/spec/output");
  }
  const handler = s["handler"] as Record<string, unknown> | undefined;
  if (!handler) {
    throw new ManifestParseError("Procedure.spec.handler is required", idx, "/spec/handler");
  }
  validateHandlerBinding(handler, idx);
  if ("requires" in s && s["requires"] != null) {
    validateRequires(s["requires"], idx);
  }
  // DRAFT keys at this level.
  for (const draft of ["errors", "retry", "idempotency"] as const) {
    if (draft in s) {
      throw new ManifestParseError(
        `Procedure.spec.${draft} is DRAFT (see ADR-0001 § "What's DRAFT" / Procedure); not supported in v0.1`,
        idx,
        `/spec/${draft}`,
        "DRAFT_KEY_USED",
      );
    }
  }
  return m;
}

function validateHandlerBinding(h: Record<string, unknown>, idx: number): void {
  const kind = h["kind"];
  if (typeof kind !== "string") {
    throw new ManifestParseError(
      "Procedure.spec.handler.kind is required (v0.1.0: 'ref')",
      idx,
      "/spec/handler/kind",
    );
  }
  if (V01X_RESERVED_HANDLER_KINDS.has(kind)) {
    // `builtin` is v0.1.x-committed (ADR-0001 § "What's DRAFT") but
    // not implemented in v0.1.0. Use the fine-grained code so authors
    // know the key is reserved-but-pending, not unknown-and-rejected.
    throw new ManifestParseError(
      `Procedure.spec.handler.kind: '${kind}' is reserved for v0.1.x but not yet implemented (see ADR-0001 § "What's DRAFT" / Procedure). Use kind: 'ref' in v0.1.0.`,
      idx,
      "/spec/handler/kind",
      "HANDLER_BUILTIN_NOT_IN_V010",
    );
  }
  if (!V01_HANDLER_KINDS.has(kind)) {
    throw new ManifestParseError(
      `Procedure.spec.handler.kind must be one of ${[...V01_HANDLER_KINDS].join(", ")}; got '${kind}'`,
      idx,
      "/spec/handler/kind",
    );
  }
  if (kind === "ref") {
    if (typeof h["ref"] !== "string" || (h["ref"] as string).length === 0) {
      throw new ManifestParseError(
        "Procedure.spec.handler.ref is required (non-empty registration key)",
        idx,
        "/spec/handler/ref",
      );
    }
    return;
  }
  // Defensive: kind === "builtin" structural checks. Currently
  // unreachable (V01X_RESERVED_HANDLER_KINDS rejects above), but kept
  // so the day `builtin` lands the only diff is removing the rejection
  // branch.
  const op = h["op"];
  if (typeof op !== "string" || !V01_BUILTIN_OPS.has(op as BuiltinOp)) {
    throw new ManifestParseError(
      `Procedure.spec.handler.op must be one of ${[...V01_BUILTIN_OPS].join(", ")}; got ${JSON.stringify(op)}`,
      idx,
      "/spec/handler/op",
    );
  }
  if (typeof h["schema"] !== "string" || (h["schema"] as string).length === 0) {
    throw new ManifestParseError(
      "Procedure.spec.handler.schema is required (Schema metadata.name) when handler.kind is 'builtin'",
      idx,
      "/spec/handler/schema",
    );
  }
  if ("ref" in h) {
    throw new ManifestParseError(
      "Procedure.spec.handler.ref is invalid when handler.kind is 'builtin' (ref + builtin are mutually exclusive)",
      idx,
      "/spec/handler/ref",
    );
  }
}

function validateRequires(req: unknown, idx: number): void {
  if (typeof req !== "object" || req === null) {
    throw new ManifestParseError("Procedure.spec.requires must be an object", idx);
  }
  const r = req as Record<string, unknown>;
  // DRAFT siblings at this level: `window`, `quota`.
  for (const draft of ["window", "quota"] as const) {
    if (draft in r) {
      throw new ManifestParseError(
        `Procedure.spec.requires.${draft} is DRAFT (see ADR-0001 § "What's DRAFT" / Procedure); not supported in v0.1`,
        idx,
        undefined,
        "DRAFT_KEY_USED",
      );
    }
  }
  if (!("auth" in r) || r["auth"] == null) return;
  const auth = r["auth"];
  if (typeof auth !== "object" || auth === null) {
    throw new ManifestParseError("Procedure.spec.requires.auth must be an object", idx);
  }
  const a = auth as Record<string, unknown>;
  if ("any" in a) {
    throw new ManifestParseError(
      "Procedure.spec.requires.auth.any is DRAFT; v0.1 supports only `all`",
      idx,
      undefined,
      "DRAFT_KEY_USED",
    );
  }
  if (!("all" in a)) {
    throw new ManifestParseError(
      "Procedure.spec.requires.auth must declare `all` (v0.1)",
      idx,
    );
  }
  const all = a["all"];
  if (!Array.isArray(all) || all.length === 0) {
    throw new ManifestParseError(
      "Procedure.spec.requires.auth.all must be a non-empty array",
      idx,
    );
  }
  for (let i = 0; i < all.length; i++) {
    validateAuthPredicate(all[i], idx, `Procedure.spec.requires.auth.all[${i}]`);
  }
}

function validateAuthPredicate(p: unknown, idx: number, path: string): asserts p is AuthPredicate {
  if (p === "ctx.user") return;
  if (typeof p === "object" && p !== null && !Array.isArray(p)) {
    const o = p as Record<string, unknown>;
    if ("ctx.staff" in o) {
      const roles = o["ctx.staff"];
      if (!Array.isArray(roles) || roles.length === 0 || roles.some((r) => typeof r !== "string")) {
        throw new ManifestParseError(
          `${path}: 'ctx.staff' value must be a non-empty array of role-name strings`,
          idx,
        );
      }
      return;
    }
  }
  // DRAFT predicates surfaced commonly.
  if (typeof p === "object" && p !== null) {
    const draftKeys = ["owns", "withinMinutes", "contains"];
    const used = draftKeys.find((k) => k in (p as Record<string, unknown>));
    if (used) {
      throw new ManifestParseError(
        `${path}: predicate '${used}' is DRAFT (see ADR-0001 § "What's DRAFT" / Procedure); not supported in v0.1`,
        idx,
        undefined,
        "DRAFT_KEY_USED",
      );
    }
  }
  throw new ManifestParseError(
    `${path} must be 'ctx.user' or { 'ctx.staff': [<role>, ...] }; got ${JSON.stringify(p)}`,
    idx,
  );
}

function validateHttpSource(source: Record<string, unknown>, idx: number): void {
  const method = source["method"];
  if (typeof method !== "string" || !V01_HTTP_METHODS.has(method as HttpMethod)) {
    throw new ManifestParseError(
      `Trigger.spec.source.method must be one of ${[...V01_HTTP_METHODS].join(", ")} (v0.1); got ${JSON.stringify(method)}`,
      idx,
      "/spec/source/method",
    );
  }
  const path = source["path"];
  if (typeof path !== "string" || path.length === 0 || !path.startsWith("/")) {
    throw new ManifestParseError(
      "Trigger.spec.source.path is required (non-empty string starting with '/')",
      idx,
      "/spec/source/path",
    );
  }
}

function validateLifecycleSource(source: Record<string, unknown>, idx: number): void {
  if (typeof source["schema"] !== "string" || (source["schema"] as string).length === 0) {
    throw new ManifestParseError(
      "Trigger.spec.source.schema is required (Schema metadata.name) when source.kind is 'lifecycle'",
      idx,
      "/spec/source/schema",
    );
  }
  const on = source["on"];
  if (!Array.isArray(on) || on.length === 0) {
    throw new ManifestParseError(
      `Trigger.spec.source.on must be a non-empty array of hook names (one of ${[...V01_LIFECYCLE_HOOKS].join(", ")})`,
      idx,
      "/spec/source/on",
    );
  }
  for (let i = 0; i < on.length; i++) {
    const hook = on[i];
    if (typeof hook !== "string" || !V01_LIFECYCLE_HOOKS.has(hook as LifecycleHook)) {
      throw new ManifestParseError(
        `Trigger.spec.source.on[${i}] must be one of ${[...V01_LIFECYCLE_HOOKS].join(", ")}; got ${JSON.stringify(hook)}`,
        idx,
        `/spec/source/on/${i}`,
      );
    }
  }
  if ("errorPolicy" in source) {
    const ep = source["errorPolicy"];
    if (typeof ep !== "string" || !V01_HOOK_ERROR_POLICIES.has(ep)) {
      throw new ManifestParseError(
        `Trigger.spec.source.errorPolicy must be 'abort' or 'continue'; got ${JSON.stringify(ep)}`,
        idx,
        "/spec/source/errorPolicy",
      );
    }
    // after_* hooks fire-and-forget (via ctx.waitUntil where
    // available); the response has already been sent when the handler
    // throws. errorPolicy: abort cannot reach the caller from there,
    // so an author who writes it on after_* gets surprising silence.
    // Reject at parse time so the misuse is caught before deploy.
    if (ep === "abort" && (on as ReadonlyArray<string>).every((h) => typeof h === "string" && h.startsWith("after_"))) {
      throw new ManifestParseError(
        "Trigger.spec.source.errorPolicy: 'abort' is invalid on after_* hooks — after_* runs after the response is sent, so abort cannot reach the caller. Move the hook to before_*, or use 'continue'.",
        idx,
        "/spec/source/errorPolicy",
      );
    }
  }
  if ("method" in source || "path" in source) {
    throw new ManifestParseError(
      "Trigger.spec.source.{method,path} are invalid when source.kind is 'lifecycle' (those keys belong to source.kind: 'http')",
      idx,
      "/spec/source",
    );
  }
}

function validateTriggerSpec(m: TriggerManifest, idx: number): TriggerManifest {
  const s = m.spec as unknown as Record<string, unknown>;
  const source = s["source"] as Record<string, unknown> | undefined;
  if (!source) {
    throw new ManifestParseError("Trigger.spec.source is required", idx, "/spec/source");
  }
  const sourceKind = source["kind"];
  if (typeof sourceKind !== "string") {
    throw new ManifestParseError("Trigger.spec.source.kind is required (v0.1.0: 'http')", idx, "/spec/source/kind");
  }
  if (V01X_RESERVED_TRIGGER_SOURCE_KINDS.has(sourceKind)) {
    // `lifecycle` is v0.1.x-committed (ADR-0001 § "What's DRAFT") but
    // not yet shipped. Fine-grained code so authors know it's
    // pending-not-rejected.
    throw new ManifestParseError(
      `Trigger.spec.source.kind: '${sourceKind}' is reserved for v0.1.x but not yet implemented (see ADR-0001 § "What's DRAFT" / Trigger). v0.1.0 supports 'http' only.`,
      idx,
      "/spec/source/kind",
      "LIFECYCLE_NOT_IN_V010",
    );
  }
  if (DRAFT_TRIGGER_SOURCE_KINDS.has(sourceKind)) {
    throw new ManifestParseError(
      `Trigger.spec.source.kind '${sourceKind}' is DRAFT (see ADR-0001 § "What's DRAFT" / Trigger); not supported in v0.1`,
      idx,
      "/spec/source/kind",
      "DRAFT_KEY_USED",
    );
  }
  if (!V01_TRIGGER_SOURCE_KINDS.has(sourceKind)) {
    throw new ManifestParseError(
      `Trigger.spec.source.kind must be 'http' (v0.1.0); got '${sourceKind}'`,
      idx,
      "/spec/source/kind",
    );
  }
  if (sourceKind === "http") validateHttpSource(source, idx);
  // Defensive: lifecycle structural checks retained for the v0.1.x
  // promotion. Currently unreachable thanks to the rejection above.
  else if (sourceKind === "lifecycle") validateLifecycleSource(source, idx);
  const target = s["target"] as Record<string, unknown> | undefined;
  if (!target || typeof target["procedure"] !== "string") {
    throw new ManifestParseError("Trigger.spec.target.procedure is required (string)", idx, "/spec/target/procedure");
  }
  if ("project" in target) {
    throw new ManifestParseError(
      "Trigger.spec.target.project is DRAFT (see ADR-0001 § \"What's DRAFT\" / Trigger); not supported in v0.1",
      idx,
      undefined,
      "DRAFT_KEY_USED",
    );
  }
  if ("atomicity" in s) {
    throw new ManifestParseError(
      "Trigger.spec.atomicity is DRAFT (see ADR-0001 § \"What's DRAFT\" / Trigger); not supported in v0.1",
      idx,
      undefined,
      "DRAFT_KEY_USED",
    );
  }
  return m;
}

export function partitionManifests(manifests: ReadonlyArray<Manifest>): {
  schemas: SchemaManifest[];
  views: ViewManifest[];
  procedures: ProcedureManifest[];
  triggers: TriggerManifest[];
} {
  const schemas: SchemaManifest[] = [];
  const views: ViewManifest[] = [];
  const procedures: ProcedureManifest[] = [];
  const triggers: TriggerManifest[] = [];
  for (const m of manifests) {
    if (m.kind === "Schema") schemas.push(m);
    else if (m.kind === "View") views.push(m);
    else if (m.kind === "Procedure") procedures.push(m);
    else triggers.push(m);
  }
  return { schemas, views, procedures, triggers };
}

export type { FilterAst };

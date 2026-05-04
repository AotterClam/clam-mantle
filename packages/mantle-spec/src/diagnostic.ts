/**
 * Structured diagnostic shape — see ADR-0008. Used uniformly across
 * static validation, test harness, boot-time, and runtime feedback
 * loops.
 *
 * Codes are unprefixed UPPER_SNAKE strings; the `phase` field
 * disambiguates which loop emitted each diagnostic. The same `code`
 * may appear in multiple phases when it names the same root cause —
 * AI consumers can group by code OR filter by phase.
 *
 * `candidates` is security-sensitive at runtime; `redactForWire`
 * strips it before HTTP egress.
 */
export type Phase = "validate" | "test" | "boot" | "runtime";

/**
 * Stable code catalog — string union, not a runtime const. Adding a
 * new code is one type change; call sites pass string literals which
 * TS narrows against this union. New entries are public wire format
 * once shipped; rename = breaking change.
 */
/**
 * The full catalog of diagnostic codes the SDK emits across all
 * phases. Per ADR-0008, spec **defines** the catalog (this union);
 * runtime / cli / adapters **emit** them. Codes in the cross-phase
 * and runtime-only sections below are not raised by spec source —
 * they live here because the catalog is the public contract, not the
 * union of what spec happens to throw today. Adding a new code is a
 * grammar-revise event (ADR-0001 § Future grammar discipline).
 */
export type DiagnosticCode =
  // Validate-only.
  | "INVALID_MANIFEST_ENVELOPE"
  | "DUPLICATE_NAME"
  | "VIEW_FROM_UNKNOWN_SCHEMA"
  | "VIEW_FIELD_NOT_IN_SCHEMA"
  | "VIEW_FILTER_FIELD_NOT_IN_SCHEMA"
  | "BIND_VALUE_NOT_IN_ENUM"
  | "AUTH_PREDICATE_NOT_IN_ENUM"
  | "UNIQUE_INDEX_FIELD_UNKNOWN"
  | "DRAFT_KEY_USED"
  // v0.1.x-committed keys present in v0.1.0 manifests are rejected
  // with a code naming the feature (per ADR-0011 § "boot validator
  // framing"), distinct from the speculative-DRAFT bucket.
  | "LIFECYCLE_NOT_IN_V010"
  | "HANDLER_BUILTIN_NOT_IN_V010"
  | "MANIFEST_ROOT_NOT_FOUND"
  | "MANIFEST_READ_FAILED"
  // Test-harness only.
  | "FIXTURE_SCHEMA_VIOLATION"
  // Cross-phase (validate / boot / runtime as applicable).
  | "HANDLER_NOT_REGISTERED"
  | "TRIGGER_TARGET_PROCEDURE_UNKNOWN"
  | "TRIGGER_PATH_COLLISION"
  | "TRIGGER_PATH_INVALID"
  | "PROCEDURE_NOT_FOUND"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  // Builtin handlers + lifecycle hooks: validate / boot.
  | "BUILTIN_HANDLER_SCHEMA_UNKNOWN"
  | "BUILTIN_HANDLER_SCHEMA_NOT_EDITORIAL"
  | "LIFECYCLE_SCHEMA_UNKNOWN"
  | "LIFECYCLE_HOOK_REJECTED"
  // Locale + translates: validate / boot.
  | "SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES"
  | "TRANSLATES_PARENT_UNKNOWN"
  | "TRANSLATES_REQUIRES_LOCALIZED"
  | "TRANSLATES_FIELD_NOT_IN_PARENT"
  | "TRANSLATES_FIELD_NOT_IN_CHILD"
  | "TRANSLATES_PARENT_IS_LOCALIZED"
  // Runtime-only (and test harness when the dispatcher reports them).
  | "INPUT_VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "AUTH_DENIED"
  | "CONFLICT"
  | "DISPATCHER_NOT_BUILT"
  | "INTERNAL_ERROR"
  | "OUTPUT_VALIDATION_FAILED"
  // Locale-data invariants: boot + runtime.
  | "INVALID_LOCALE";

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly phase: Phase;
  readonly severity: "error" | "warning";
  readonly path: string;
  readonly value?: unknown;
  readonly expected?: string;
  readonly candidates?: readonly string[];
  readonly suggestion?: string;
  readonly message: string;
}

/**
 * HTTP status mapping for codes that surface on the wire (runtime
 * phase). Codes not in this map default to 500 when surfaced over
 * HTTP. Validate / test / boot phases don't map to HTTP — they
 * surface in CLI exit codes / thrown errors / Worker init logs.
 *
 * Narrowed to a status-literal union so adding a code with a status
 * outside the v0.1 set fails compile.
 */
export type RuntimeHttpStatus = 400 | 401 | 403 | 404 | 405 | 409 | 500 | 501;

export const HTTP_STATUS_BY_CODE: Readonly<Partial<Record<DiagnosticCode, RuntimeHttpStatus>>> = {
  INPUT_VALIDATION_FAILED: 400,
  INVALID_LOCALE: 400,
  UNAUTHENTICATED: 401,
  AUTH_DENIED: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  HANDLER_NOT_REGISTERED: 500,
  DISPATCHER_NOT_BUILT: 501,
  INTERNAL_ERROR: 500,
  OUTPUT_VALIDATION_FAILED: 500,
  // Lifecycle before_* hook explicitly aborted the mutation. 409 is
  // the right fit (the hook rejected based on resource state — bot
  // check failed, rate limit hit, etc.); the structured diagnostic
  // includes the failing hook's name for surfacing to the caller.
  LIFECYCLE_HOOK_REJECTED: 409,
};

/** Resolve a Diagnostic's HTTP status for wire egress; unknown codes
 *  default to 500. Lives in mantle-spec so every adapter shares one
 *  mapping. */
export function httpStatusFor(d: Diagnostic): RuntimeHttpStatus {
  return HTTP_STATUS_BY_CODE[d.code] ?? 500;
}

/**
 * Build a Diagnostic with a derived `message`. Call sites populate
 * the structured fields; `message` is generated from them so prose
 * cannot drift from structure.
 */
export function makeDiagnostic(
  input: Omit<Diagnostic, "message"> & { message?: string },
): Diagnostic {
  const { code, phase, severity, path, value, expected, candidates, suggestion } = input;
  let msg = input.message;
  if (!msg) {
    const parts: string[] = [`[${phase}/${code}] at ${path}`];
    if (expected) parts.push(`expected ${expected}`);
    if (value !== undefined) parts.push(`got ${formatValue(value)}`);
    if (suggestion) parts.push(`(did you mean ${suggestion}?)`);
    msg = parts.join("; ");
  }
  return { code, phase, severity, path, value, expected, candidates, suggestion, message: msg };
}

/** Phase-stamping helpers — equivalent to `makeDiagnostic({...input, phase})`
 *  but read cleaner at call sites. */
export const validateDiagnostic = (input: PhaselessInput): Diagnostic => makeDiagnostic({ ...input, phase: "validate" });
export const testDiagnostic = (input: PhaselessInput): Diagnostic => makeDiagnostic({ ...input, phase: "test" });
export const bootDiagnostic = (input: PhaselessInput): Diagnostic => makeDiagnostic({ ...input, phase: "boot" });
export const runtimeDiagnostic = (input: PhaselessInput): Diagnostic => makeDiagnostic({ ...input, phase: "runtime" });

type PhaselessInput = Omit<Diagnostic, "phase" | "message"> & { message?: string };

function formatValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 100 ? s.slice(0, 97) + "..." : s;
  } catch {
    return "[unserializable]";
  }
}

/**
 * Throwable carrier for one or more Diagnostics. Layers that surface
 * an error across a transport boundary (HTTP handler, MCP tool call,
 * render pipeline) throw this so the boundary catch can detect a
 * structured payload and emit it on the wire instead of falling back
 * to the INTERNAL_ERROR envelope reserved for genuinely unexpected
 * throws.
 *
 * The dispatcher returns Result-shaped values with embedded
 * Diagnostics and never throws — DiagnosticError is for the layers
 * above and beside the dispatcher (MCP deps, render/publish, admin
 * handlers) where a Promise<T> contract makes Result-style returns
 * awkward.
 */
export class DiagnosticError extends Error {
  readonly diagnostics: readonly Diagnostic[];
  constructor(diagnostic: Diagnostic | readonly Diagnostic[]) {
    const list = Array.isArray(diagnostic) ? diagnostic : [diagnostic as Diagnostic];
    const head = list[0];
    super(head ? head.message : "DiagnosticError");
    this.name = "DiagnosticError";
    this.diagnostics = list;
  }

  /** First diagnostic — convenience for single-diagnostic call sites. */
  get diagnostic(): Diagnostic {
    const d = this.diagnostics[0];
    if (!d) throw new Error("DiagnosticError carries no diagnostics");
    return d;
  }
}

/**
 * Strip security-sensitive fields for wire egress. Per ADR-0008:
 * never expose `candidates` to untrusted callers — that leaks
 * schema information. Internal phases (validate / test / boot)
 * skip this redaction.
 */
export function redactForWire(d: Diagnostic): Diagnostic {
  if (d.candidates === undefined) return d;
  const { candidates: _omit, ...rest } = d;
  return rest;
}

/**
 * Inverse of `redactForWire`: tolerantly parse a JSON string into a
 * Diagnostic, returning `null` on anything that isn't a Diagnostic
 * (non-JSON, missing required fields, etc.). Intended for consumers
 * receiving HTTP error bodies — runtime egress, MCP `error.data`,
 * any future SDK adapter.
 */
export function parseWireDiagnostic(text: string): Diagnostic | null {
  if (!text) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed["code"] !== "string") return null;
  if (typeof parsed["message"] !== "string") return null;
  if (typeof parsed["path"] !== "string") return null;
  const phase = parsed["phase"];
  if (phase !== "validate" && phase !== "test" && phase !== "boot" && phase !== "runtime") {
    return null;
  }
  const severity = parsed["severity"];
  if (severity !== "error" && severity !== "warning") return null;
  // The code wasn't validated against the union — that would couple
  // wire parsing to the enumeration of every code. Consumers branching
  // on `code` should pattern-match the strings they care about and
  // treat unknowns as a generic error.
  return parsed as unknown as Diagnostic;
}

/**
 * Walk a JSON Pointer (RFC 6901) on a value. Returns `undefined` for
 * any miss. Best-effort — used to surface the offending value inside
 * a diagnostic, not for strict pointer dereferencing.
 */
export function readJsonPointer(root: unknown, jsonPointer: string): unknown {
  if (!jsonPointer || jsonPointer === "/") return root;
  const parts = jsonPointer.split("/").slice(1).map(unescapePointer);
  let cur: unknown = root;
  for (const part of parts) {
    if (cur && typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function unescapePointer(s: string): string {
  return s.replace(/~1/g, "/").replace(/~0/g, "~");
}

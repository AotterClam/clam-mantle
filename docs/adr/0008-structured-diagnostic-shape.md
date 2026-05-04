# ADR-0008: Structured diagnostic shape for AI-parseable errors

**Status:** Carried over from POC v0.0.x; refreshed for v0.1.0.

**Date**: 2026-04-30 (POC); refreshed 2026-05-03 for v0.1.0 rebuild.

**Deciders**: phsu

**Related**: ADR-0007 (the AI-as-primary-author contract this diagnostic format serves), ADR-0009 (zod runtime — when ported).

---

## Context

ADR-0007 commits the SDK to three feedback loops (static
validation, test harness, boot-time fail-fast) on top of the
existing runtime layer. Each loop emits errors. If each emits
its own ad-hoc shape, the consumer Claude Code reading those
errors must write three or four parsers — defeating the
"deterministic feedback" property that justified the contract in
the first place.

An earlier runtime error vocabulary (`INPUT_VALIDATION_FAILED`,
`AUTH_DENIED`, `HANDLER_NOT_REGISTERED`, `DISPATCHER_NOT_BUILT`,
`INTERNAL_ERROR`) was HTTP-shaped: a short code + a status + a
free-form message. That is under-specified for the new loops:

- A static-validation error needs to point to **a file path and
  manifest pointer**, not an HTTP status.
- A "you used an unknown Schema name" error needs to carry the
  **list of known Schemas** and a **best-guess suggestion**, so
  the AI author can fix without doing its own grep.
- A boot error needs to declare **what was checked and what was
  missing**, so the deploy log is self-explanatory.
- All four loops should agree on **severity** (error vs warning)
  so CI integrations don't need per-loop logic.

A free-form message field carries all of this in prose, but
forces the AI author to do natural-language parsing on every
diagnostic before it can route a fix. Structure is cheaper.

## Decision

All four feedback loops emit diagnostics in the following shape.
The canonical type, the diagnostic-code constants, and the phase
helpers all live in `@aotter/mantle-spec`; every other
package (runtime, cloudflare adapter, admin UI, CLI) imports from
there.

```ts
type Phase = "validate" | "test" | "boot" | "runtime";

interface Diagnostic {
  /** Stable machine code. UPPER_SNAKE, no prefix. */
  code: string;
  /** Which feedback loop emitted this diagnostic. */
  phase: Phase;
  /** "error" blocks the loop's exit-zero / serve-loop / etc.
   *  "warning" surfaces but does not block. */
  severity: "error" | "warning";
  /** Filesystem path or manifest pointer (JSON Pointer style)
   *  identifying where the issue is. */
  path: string;
  /** What the validator/dispatcher saw. */
  value?: unknown;
  /** One-line description of what was expected. */
  expected?: string;
  /** Valid alternatives, when the expected set is enumerable. */
  candidates?: string[];
  /** Best-guess fix string, when one is high-confidence. */
  suggestion?: string;
  /** Human-readable fallback prose. AI authors should prefer
   *  the structured fields; humans reading TTY output read this. */
  message: string;
}
```

### Code naming convention

Codes are **UPPER_SNAKE, unprefixed**. The `phase` field
disambiguates which feedback loop emitted the diagnostic.

When the same root cause surfaces in multiple loops, the same
`code` is reused with a different `phase`. AI consumers can
group by `code` (root-cause grouping across loops) or filter
by `phase` (this-loop-only handling). Concrete examples:

| code | phases | example contexts |
|---|---|---|
| `HANDLER_NOT_REGISTERED` | `validate`, `boot`, `runtime` | textual grep miss (warning, validate); registry lookup miss (error, boot); dispatch attempt miss (error, runtime, defense-in-depth) |
| `TRIGGER_TARGET_PROCEDURE_UNKNOWN` | `validate`, `boot` | dangling reference caught by either loop |
| `TRIGGER_PATH_COLLISION` | `validate`, `boot` | two http Triggers on same method+path |
| `NOT_FOUND` | `test`, `runtime` | unknown name in queryView / GET /api/v1/v/X |
| `INPUT_VALIDATION_FAILED` | `runtime`, `test` | zod validation fail (test harness shares the dispatcher path) |

Codes that are loop-exclusive simply never appear with another
phase — e.g. `FIXTURE_SCHEMA_VIOLATION` only fires in
`phase: "test"`; `INVALID_MANIFEST_ENVELOPE` only in
`phase: "validate"`.

### Why no prefixes

Earlier drafts of this ADR proposed `V_/T_/B_/R_*` prefixes per
loop. That was retired because:

- **It bakes provenance into the symbol** when a structured
  field already carries it cleaner. `phase` is the right place;
  prefix in the code string is redundant.
- **It forces three different codes for the same root cause**
  (`V_HANDLER_REF_NOT_REGISTERED_IN_SOURCE`,
  `B_HANDLER_REF_NOT_REGISTERED`, `R_HANDLER_NOT_REGISTERED`),
  fragmenting consumer error handling. A consumer that wants
  "treat any 'handler not registered' issue uniformly" had to
  parse the prefix off the symbol — defeating the parseability
  argument that justified structure in the first place.
- **It's not a standard convention** — closest cousins are
  PHP's `E_*` legacy constants and PostgreSQL SQLSTATE class
  prefixes; both are artefacts of language eras when structured
  records weren't ergonomic. Modern systems (gRPC, OAuth 2.0
  RFC 6749, Stripe API, AWS) use plain UPPER_SNAKE or
  lower_snake without prefixes and identify source through
  separate fields.

### `path` format

- For static validation: filesystem path + JSON Pointer fragment,
  e.g. `starters/blog/manifests/recent-published.view.yaml#/spec/from`.
- For test harness: test file path + assertion location when
  available, e.g. `tests/handlers/contact.test.ts:42`.
- For boot-time: manifest pointer (no on-disk path because boot
  reads parsed manifests, not files), e.g.
  `manifest:View/recent-published#/spec/from`.
- For runtime: HTTP request path + JSON Pointer into request
  body, e.g. `POST /api/contact#/body/email`.

The convention is "the most specific locator the loop has access
to." All four are strings; AI parsers can dispatch on prefix
(`/`, `manifest:`, HTTP method, test runner format).

### `candidates` — when to populate

Populate when the expected set is **finite and known at
diagnostic time**:
- `VIEW_FROM_UNKNOWN_SCHEMA` → list all declared Schemas
- `BIND_VALUE_NOT_IN_ENUM` → list `["ctx.user", "ctx.staff", "now"]`
- `HANDLER_NOT_REGISTERED` (`phase: boot`) → list registered ref names
- `AUTH_DENIED` (`phase: runtime`) → **do not populate**
  (security: don't tell the caller which roles would have worked)

Omit when the expected set is open (e.g. "any non-empty string"
for `metadata.name`).

### `suggestion` — when to populate

Populate when one candidate is high-confidence (e.g. typo via
edit-distance ≤ 2 on a short identifier). Otherwise omit.
Suggestions are advisory; the AI author should still verify
before applying.

### CLI output mode

- `--format=json` (default when stdout is **not** a TTY, e.g. CI,
  AI-author): emits `{ "diagnostics": [<Diagnostic>, ...] }` on
  stdout; exit code 1 if any has `severity: "error"`, else 0.
- `--format=text` (default when stdout **is** a TTY, i.e. human
  at terminal): pretty-prints with file:line, colored severity,
  prose message, and a "did you mean?" line when `suggestion`
  is set.

The same diagnostic objects power both modes; text mode is a
formatter, not a separate code path. AI authors invoking the CLI
get JSON automatically because they pipe through subprocess; no
flag needed.

### Test harness diagnostic surface

Test harness errors are returned as result objects, not thrown:

```ts
type InvokeResult<T> =
  | { ok: true; data: T }
  | { ok: false; diagnostic: Diagnostic };
```

Tests check `result.ok` and assert against `result.diagnostic.code`
(stable string), not against thrown exception types. This makes
test code robust to error-class refactoring inside the SDK.

### Runtime diagnostic surface

Runtime HTTP responses on error paths emit a JSON body of the
same shape, plus the HTTP status from the existing error-code
table. The `path` field becomes the HTTP request locator
(method + URL + JSON Pointer for body issues). The `candidates`
field is **always omitted** at runtime to avoid leaking schema
information to untrusted callers.

```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{
  "code": "INPUT_VALIDATION_FAILED",
  "phase": "runtime",
  "severity": "error",
  "path": "POST /api/contact#/body/email",
  "value": "not-an-email",
  "expected": "string matching format=email",
  "message": "Field 'email' must be a valid email address."
}
```

### Validator translation (zod, not Ajv)

The POC originally translated Ajv `ErrorObject[]` into
`Diagnostic[]` for `INPUT_VALIDATION_FAILED`. Late in the POC
(PR #81) the runtime validator was swapped to **zod** so the
admin SPA and CF Workers could share a CSP-safe path with no
`Function`-constructor codegen. The v0.1.0 rebuild inherits zod
from day 1 — manifest authoring stays JSON Schema, but the
runtime validator a manifest author's request body hits is a
zod schema, produced by the JSON-Schema → zod converter in
`@aotter/mantle-spec` (see ADR-0009 when ported).

Concretely, the translation now consumes `ZodError.issues`:

- `issue.path: (string|number)[]` → JSON Pointer fragment on the
  diagnostic's `path` (URL-encoded indices, `/` between segments).
- `issue.code` (`invalid_type`, `too_small`, `invalid_string`,
  `invalid_enum_value`, `unrecognized_keys`, …) → mapped to a
  small enumerated `expected` string, not surfaced as the
  Diagnostic `code` itself. The Diagnostic `code` stays
  `INPUT_VALIDATION_FAILED` for the family — keeping the consumer
  contract stable across validator-library swaps.
- `invalid_enum_value.options` → `candidates` (validate / test /
  boot phases only; stripped at runtime per the rule above).
- `issue.message` is treated as fallback prose; the Diagnostic's
  `message` is regenerated from the structured fields by the
  shared formatter, so a future zod upgrade that re-words its
  defaults doesn't ripple into our consumer-facing strings.

The same rule that retired Ajv's per-validator error format as a
Diagnostic candidate (alternative (d) below) applies to zod —
`ZodError` is internal plumbing, `Diagnostic` is the public surface.

## Consequences

### Pros

- One parser handles errors from any loop. AI consumer code can
  branch on `code` prefix or suffix without per-loop adapters.
- `candidates` + `suggestion` make the most common author errors
  (typo, unknown name, wrong enum value) one-step fixes — the AI
  author reads the diagnostic and writes the corrected manifest
  in the same turn, no grep or human prompting needed.
- `severity: warning` gives the validator a way to surface "this
  is fishy but legal" without blocking — preserves the
  permissive-validator discipline (see ADR-0007 risks).
- Same shape for HTTP responses keeps the runtime layer
  consistent with the contract layers; consumers' app frontends
  and AI authors see the same structure.
- Single source of truth. The interface, code constants, and
  formatter all live in `@aotter/mantle-spec`; the runtime
  package and adapters import them. A future `mantle-netlify`
  inherits the shape for free.

### Costs

- Shape locked early: any field-shape change forces a doc revise
  + a code change across CLI / harness / runtime / consumer
  parsers.
- Implementing `candidates` and `suggestion` correctly requires
  the validator/dispatcher to track richer context (the set of
  declared Schema names, the registered ref list, etc.). More
  bookkeeping, more code.
- Stable codes are a public surface. Renaming `VIEW_FROM_UNKNOWN_SCHEMA`
  to a "better" name later is a breaking change for any
  consumer-side error handling.

### Risks

- **Codes proliferate**. Without discipline, every assertion
  becomes its own code (`NAME_TOO_LONG`, `NAME_TOO_SHORT`,
  `NAME_HAS_UPPERCASE`...). Mitigation: codes are scoped by
  failure mode, not by individual assertion. `INVALID_NAME`
  with `expected: "kebab-case, 1-64 chars"` covers the family;
  the `value` and `expected` fields carry the specifics.
- **`message` and structured fields drift**. The free-form
  message contradicts the structured fields. Mitigation: in the
  spec package, `message` is generated FROM the structured
  fields by a single formatter; not authored separately per
  diagnostic site.
- **`candidates` leaks information at runtime**. Already
  addressed: runtime responses omit `candidates`. Code review
  should treat any runtime path that populates `candidates` as a
  bug.

## Alternatives considered

**(a) Free-form prose messages only**. Rejected: AI parsing
burden, and "did you mean?" suggestions become inline text the
AI must extract.

**(b) Just exit code + count of errors**. Rejected: gives the AI
no fixable information; turns every failure into a re-run-with-
verbose-flag escalation.

**(c) Reuse OpenAPI Problem+JSON (RFC 7807)**. Rejected: too
HTTP-flavored (the `type` URI, the `instance` URI), doesn't
carry path/candidates/suggestion structure cleanly. Adopting
Problem+JSON for the runtime layer specifically might be
considered later as an opt-in alternate output mode for
HTTP-strict consumers.

**(d) Surface validator-library error formats directly (Ajv
`ErrorObject`, zod `ZodError`)**. Rejected: those formats are
internal to the validator implementation, change between
library versions, and don't fit non-validation errors (handler
not registered, schema drift, etc.). The library's error
objects feed *into* the Diagnostic translator described under
"Validator translation"; they are never the public surface.

## How to apply

- New error codes: choose a suffix that names the failure
  family, not the specific assertion. UPPER_SNAKE, no prefix.
  Add the constant to `@aotter/mantle-spec`'s diagnostic
  code module; do not redeclare per-package.
- When the same root cause can be caught by multiple loops,
  reuse the code; let `phase` distinguish.
- Implementation: `message` is derived from structured fields by
  a single helper (`makeDiagnostic` + phase-helpers
  `validateDiagnostic` / `testDiagnostic` / `bootDiagnostic` /
  `runtimeDiagnostic`), all exported from
  `@aotter/mantle-spec`, not authored at each error site.
- Documentation: every code in the catalog gets one row in the
  v0.1.0 authoring-contract doc (when ported) under
  § Error catalog with `code`, applicable phases,
  when-it-fires, and an example diagnostic.

## Implementation status

**v0.1.0 rebuild — porting in progress.** The shape is locked
by this ADR; the canonical declarations land in
`@aotter/mantle-spec/src/diagnostic.ts` (interface +
`DIAGNOSTIC_CODES` constants + `makeDiagnostic` formatter +
`validateDiagnostic` / `testDiagnostic` / `bootDiagnostic` /
`runtimeDiagnostic` phase helpers). `@aotter/mantle-runtime`
imports them for the dispatcher and the boot validator;
`@aotter/mantle-cloudflare` imports them for HTTP error
responses; the admin UI imports them so the in-browser editor
surfaces the same structured errors the CLI does. The
`aotter/mantle` v0.1.0 milestone tracks the per-package
landings.

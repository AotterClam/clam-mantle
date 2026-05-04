import {
  bootDiagnostic,
  partitionManifests,
  checkLocaleAndTranslates,
  type Diagnostic,
  type Manifest,
  type ProcedureManifest,
  type SchemaManifest,
  type TriggerManifest,
} from "@aotter/mantle-spec";
import type { HandlerRegistry } from "../../domain/port/HandlerRegistry.js";

/**
 * `ValidateBootUseCase` — Loop 3 of the SDK authoring contract (see
 * ADR-0007). Walks the parsed manifest set + in-memory handler
 * registry; refuses to proceed if any load-bearing invariant is
 * violated. Per ADR-0007: "process exit non-zero, do not serve" — a
 * missing handler ref must surface as a deploy failure, not a runtime
 * 500 to a customer.
 *
 * In Cloudflare Workers context "process exit" maps to: throw at
 * runtime module-init so `wrangler tail` reports the init error and
 * subsequent requests get the runtime's generic 500 (instead of
 * unevaluated handlers being exercised).
 *
 * v0.1.0 invariants:
 *   - Every `Procedure.handler.ref` is in the supplied registry.
 *   - Every `Procedure.handler.builtin.schema` resolves to a declared
 *     Schema (`BUILTIN_HANDLER_SCHEMA_UNKNOWN`). Builtin op execution
 *     itself ships in `InvokeBuiltinUseCase`.
 *   - Every `Trigger.target.procedure` resolves to a manifest.
 *   - Every `http` Trigger has a unique `(method, path)` pair and a
 *     `/api/` prefix.
 *   - Every `Trigger.source.kind: lifecycle` watches a declared Schema
 *     (`LIFECYCLE_SCHEMA_UNKNOWN`). The hook runtime is the
 *     `LifecycleHookingEntryRepository` decorator.
 *   - Locale + translates cross-Schema invariants (ADR-0010) hold.
 */
export type ValidateBootResponse =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export interface ValidateBootRequest {
  readonly manifests: readonly Manifest[];
  readonly registry: HandlerRegistry;
  /** Site config locales (ADR-0010). Empty/absent enables the
   *  zero-locale-site path: any localized Schema fails boot with
   *  `SCHEMA_LOCALIZED_REQUIRES_SITE_LOCALES`. The runtime's
   *  bootInit reads this from `site_config` before validating. */
  readonly siteLocales?: readonly string[];
}

export class ValidateBootUseCase {
  execute(request: ValidateBootRequest): ValidateBootResponse {
    const partitioned = partitionManifests([...request.manifests]);
    const proceduresByName = new Map<string, ProcedureManifest>();
    for (const p of partitioned.procedures) proceduresByName.set(p.metadata.name, p);
    const schemasByName = new Map<string, SchemaManifest>();
    for (const s of partitioned.schemas) schemasByName.set(s.metadata.name, s);

    const diagnostics: Diagnostic[] = [];
    const procedureCandidates = [...proceduresByName.keys()];
    const schemaCandidates = [...schemasByName.keys()];
    const handlerCandidates = request.registry.list();

    // 1. Procedure handler refs + builtin schema cross-resolution.
    for (const p of partitioned.procedures) {
      const h = p.spec.handler;
      if (h.kind === "ref" && !request.registry.has(h.ref)) {
        diagnostics.push(
          bootDiagnostic({
            code: "HANDLER_NOT_REGISTERED",
            severity: "error",
            path: `manifest:Procedure/${p.metadata.name}#/spec/handler/ref`,
            value: h.ref,
            expected: `a function registered via the handlers option / sdk.registerHandler('${h.ref}', fn)`,
            candidates: handlerCandidates,
            message: `Procedure '${p.metadata.name}' declares handler.ref '${h.ref}' but no handler is registered for that key. Wire it in your project's handlers map: { '${h.ref}': ... }.`,
          }),
        );
      }
      if (h.kind === "builtin" && !schemasByName.has(h.schema)) {
        diagnostics.push(
          bootDiagnostic({
            code: "BUILTIN_HANDLER_SCHEMA_UNKNOWN",
            severity: "error",
            path: `manifest:Procedure/${p.metadata.name}#/spec/handler/schema`,
            value: h.schema,
            expected: "name of a declared Schema",
            candidates: schemaCandidates,
            message: `Procedure '${p.metadata.name}' (handler.kind: builtin) targets unknown Schema '${h.schema}'.`,
          }),
        );
      }
    }

    // 2. Trigger.target.procedure resolves.
    for (const t of partitioned.triggers) {
      if (!proceduresByName.has(t.spec.target.procedure)) {
        diagnostics.push(
          bootDiagnostic({
            code: "TRIGGER_TARGET_PROCEDURE_UNKNOWN",
            severity: "error",
            path: `manifest:Trigger/${t.metadata.name}#/spec/target/procedure`,
            value: t.spec.target.procedure,
            expected: "name of a declared Procedure",
            candidates: procedureCandidates,
            message: `Trigger '${t.metadata.name}' targets unknown Procedure '${t.spec.target.procedure}'.`,
          }),
        );
      }
      if (t.spec.source.kind === "lifecycle") {
        if (!schemasByName.has(t.spec.source.schema)) {
          diagnostics.push(
            bootDiagnostic({
              code: "LIFECYCLE_SCHEMA_UNKNOWN",
              severity: "error",
              path: `manifest:Trigger/${t.metadata.name}#/spec/source/schema`,
              value: t.spec.source.schema,
              expected: "name of a declared Schema",
              candidates: schemaCandidates,
              message: `Trigger '${t.metadata.name}' watches unknown Schema '${t.spec.source.schema}'.`,
            }),
          );
        }
      }
    }

    // 3. HTTP trigger uniqueness + /api/ prefix.
    diagnostics.push(...checkHttpRouteCollisions(partitioned.triggers));
    diagnostics.push(...checkHttpRoutePrefix(partitioned.triggers));

    // 4. Locale + translates cross-Schema invariants.
    diagnostics.push(
      ...checkLocaleAndTranslates({
        schemas: partitioned.schemas,
        phase: "boot",
        siteLocales: request.siteLocales,
      }),
    );

    if (diagnostics.length === 0) return { ok: true };
    return { ok: false, diagnostics };
  }

  /** Validate; on failure, throw `BootValidationError`. */
  assert(request: ValidateBootRequest): void {
    const result = this.execute(request);
    if (!result.ok) throw new BootValidationError(result.diagnostics);
  }
}

function checkHttpRouteCollisions(triggers: readonly TriggerManifest[]): Diagnostic[] {
  const seen = new Map<string, string>();
  const out: Diagnostic[] = [];
  for (const t of triggers) {
    if (t.spec.source.kind !== "http") continue;
    const key = `${t.spec.source.method} ${t.spec.source.path}`;
    const prior = seen.get(key);
    if (prior) {
      out.push(
        bootDiagnostic({
          code: "TRIGGER_PATH_COLLISION",
          severity: "error",
          path: `manifest:Trigger/${t.metadata.name}#/spec/source`,
          value: key,
          expected: `unique (method, path) across http Triggers (also declared by '${prior}')`,
          message: `Trigger '${t.metadata.name}' shares route ${key} with Trigger '${prior}'.`,
        }),
      );
    } else {
      seen.set(key, t.metadata.name);
    }
  }
  return out;
}

function checkHttpRoutePrefix(triggers: readonly TriggerManifest[]): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const t of triggers) {
    if (t.spec.source.kind !== "http") continue;
    const path = t.spec.source.path;
    if (!path.startsWith("/api/")) {
      out.push(
        bootDiagnostic({
          code: "TRIGGER_PATH_INVALID",
          severity: "error",
          path: `manifest:Trigger/${t.metadata.name}#/spec/source/path`,
          value: path,
          expected: "path starting with '/api/'",
          message:
            `Trigger '${t.metadata.name}' has path '${path}' — http Trigger ` +
            `paths MUST start with '/api/' so adapters can route public ` +
            `pages and Procedure endpoints without ambiguity.`,
        }),
      );
    }
  }
  return out;
}

/**
 * Single Error wrapping every boot diagnostic. The runtime throws this
 * during `bootInit`; adapters surface it in their init logs.
 */
export class BootValidationError extends Error {
  constructor(public readonly diagnostics: readonly Diagnostic[]) {
    const summary = diagnostics
      .map((d) => `  - ${d.code} (phase: ${d.phase}) at ${d.path}: ${d.message}`)
      .join("\n");
    super(
      `Runtime boot validation failed (${diagnostics.length} error(s)):\n${summary}\n\n` +
        `See ADR-0007 (boot-time fail-fast) for context. Diagnostics also ` +
        `available on the .diagnostics field of this error for programmatic handling.`,
    );
    this.name = "BootValidationError";
  }
}

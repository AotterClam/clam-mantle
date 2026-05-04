import {
  firstZodIssueAsJsonPointer,
  jsonSchemaToZod,
  makeDiagnostic,
  readJsonPointer,
  type AuthPredicate,
  type Diagnostic,
  type Phase,
  type ProcedureManifest,
} from "@aotterclam/clam-cms-spec";
import type { ZodType } from "zod";
import type { HandlerContext } from "../../domain/model/HandlerContext.js";
import type { HandlerRegistry } from "../../domain/port/HandlerRegistry.js";

/**
 * `InvokeProcedureUseCase` — in-process invocation of a Procedure.
 * HTTP-agnostic — the adapter's mount layer wraps this to map to/from
 * `Request` / `Response`. The test harness exercises the same entry
 * point.
 *
 * Order of operations:
 *   1. Evaluate `requires.auth.all` predicates against `ctx`. Deny ⇒
 *      `AUTH_DENIED`.
 *   2. Validate `input` against the Procedure's `input` JSON Schema.
 *      Fail ⇒ `INPUT_VALIDATION_FAILED` (first zod issue).
 *   3. Resolve `handler.ref` in the registry. Missing ⇒
 *      `HANDLER_NOT_REGISTERED` (boot validation should have caught
 *      this; runtime path is defense-in-depth).
 *   4. Call the handler. Throws ⇒ `INTERNAL_ERROR` carrying the
 *      thrown message; `InvokeFailure` is unwrapped instead.
 *   5. Validate the handler's return against the `output` schema.
 *      Fail ⇒ `OUTPUT_VALIDATION_FAILED` (handler bug).
 *
 * v0.1.0 ships `handler.kind: ref` only. `handler.kind: builtin` is
 * v0.1.x-committed and rejected at boot with
 * `HANDLER_BUILTIN_NOT_IN_V010`.
 */
export interface InvokeProcedureRequest {
  readonly procedure: ProcedureManifest;
  readonly input: unknown;
  readonly ctx: HandlerContext;
  /** Path-locator prefix for `Diagnostic.path`. The HTTP mount passes
   *  e.g. `POST /api/contact`; the test harness passes
   *  `manifest:Procedure/<name>`. */
  readonly pathPrefix?: string;
  /** Phase to stamp on emitted diagnostics. Default: `"runtime"`. */
  readonly phase?: Phase;
}

/**
 * Throwable carrier for handlers that want to surface a structured
 * Diagnostic without going through the generic `INTERNAL_ERROR`
 * envelope. The use case catches it and converts to an
 * `{ ok: false, diagnostic }` return.
 */
export class InvokeFailure extends Error {
  constructor(public readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = "InvokeFailure";
  }
}

export type InvokeProcedureResponse<O = unknown> =
  | { readonly ok: true; readonly data: O }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export class InvokeProcedureUseCase {
  // Per-Procedure compiled zod schemas. zod composition is pure
  // object-tree assembly (no `new Function`) — Workers-CSP-safe.
  // Cached per use-case instance because `jsonSchemaToZod` walks the
  // JSON Schema once per call. Two runtimes with manifests sharing a
  // procedure name + different schemas will get separate caches
  // because the runtime owns the use case instance.
  private readonly inputCache = new Map<string, ZodType>();
  private readonly outputCache = new Map<string, ZodType>();

  constructor(private readonly registry: HandlerRegistry) {}

  async execute<O = unknown>(request: InvokeProcedureRequest): Promise<InvokeProcedureResponse<O>> {
    const { procedure, input, ctx } = request;
    const phase: Phase = request.phase ?? "runtime";
    const procPath = request.pathPrefix ?? `manifest:Procedure/${procedure.metadata.name}`;

    // 1. Auth.
    const denial = evaluateAuthAll(procedure, ctx, procPath, phase);
    if (denial) return { ok: false, diagnostic: denial };

    // 2. Input validation.
    const inputValidator = this.compileInput(procedure);
    const inputResult = inputValidator.safeParse(input);
    if (!inputResult.success) {
      const { instancePath, message } = firstZodIssueAsJsonPointer(inputResult.error);
      return {
        ok: false,
        diagnostic: makeDiagnostic({
          code: "INPUT_VALIDATION_FAILED",
          phase,
          severity: "error",
          path: `${procPath}#/input${instancePath}`,
          value: readJsonPointer(input, instancePath),
          expected: message,
        }),
      };
    }

    // 3. Resolve handler.
    const handlerBinding = procedure.spec.handler;
    if (handlerBinding.kind !== "ref") {
      return {
        ok: false,
        diagnostic: makeDiagnostic({
          code: "HANDLER_BUILTIN_NOT_IN_V010",
          phase,
          severity: "error",
          path: `${procPath}#/handler/kind`,
          value: handlerBinding.kind,
          expected: "handler.kind: ref (v0.1.0 ships ref only)",
        }),
      };
    }
    const handler = this.registry.get(handlerBinding.ref);
    if (!handler) {
      return {
        ok: false,
        diagnostic: makeDiagnostic({
          code: "HANDLER_NOT_REGISTERED",
          phase,
          severity: "error",
          path: `${procPath}#/handler/ref`,
          value: handlerBinding.ref,
          expected: "a ref registered via the handlers option / sdk.registerHandler",
          candidates: this.registry.list(),
        }),
      };
    }

    // 4. Call handler.
    let result: unknown;
    try {
      result = await handler(inputResult.data, ctx);
    } catch (err) {
      if (err instanceof InvokeFailure) {
        return { ok: false, diagnostic: err.diagnostic };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        diagnostic: makeDiagnostic({
          code: "INTERNAL_ERROR",
          phase,
          severity: "error",
          path: procPath,
          expected: "handler completes without throwing",
          message: `Handler '${handlerBinding.ref}' threw: ${msg}`,
        }),
      };
    }

    // 5. Output validation.
    const outputValidator = this.compileOutput(procedure);
    const outputResult = outputValidator.safeParse(result);
    if (!outputResult.success) {
      const { instancePath, message } = firstZodIssueAsJsonPointer(outputResult.error);
      return {
        ok: false,
        diagnostic: makeDiagnostic({
          code: "OUTPUT_VALIDATION_FAILED",
          phase,
          severity: "error",
          path: `${procPath}#/output${instancePath}`,
          value: readJsonPointer(result, instancePath),
          expected: message,
          message: `Handler '${handlerBinding.ref}' returned a value that does not match its declared output schema. This is a handler bug.`,
        }),
      };
    }

    return { ok: true, data: result as O };
  }

  /** Test seam — clear validator caches between tests when manifests
   *  change between runs. Production paths never call this. */
  _clearValidatorCaches(): void {
    this.inputCache.clear();
    this.outputCache.clear();
  }

  private compileInput(p: ProcedureManifest): ZodType {
    const k = p.metadata.name;
    let v = this.inputCache.get(k);
    if (!v) {
      v = jsonSchemaToZod(p.spec.input);
      this.inputCache.set(k, v);
    }
    return v;
  }

  private compileOutput(p: ProcedureManifest): ZodType {
    const k = p.metadata.name;
    let v = this.outputCache.get(k);
    if (!v) {
      v = jsonSchemaToZod(p.spec.output);
      this.outputCache.set(k, v);
    }
    return v;
  }
}

function evaluateAuthAll(
  procedure: ProcedureManifest,
  ctx: HandlerContext,
  procPath: string,
  phase: Phase,
): Diagnostic | null {
  const all = procedure.spec.requires?.auth?.all;
  if (!all || all.length === 0) return null;
  for (let i = 0; i < all.length; i++) {
    const pred = all[i]!;
    if (!evaluatePredicate(pred, ctx)) {
      return makeDiagnostic({
        code: "AUTH_DENIED",
        phase,
        severity: "error",
        path: `${procPath}#/requires/auth/all/${i}`,
        expected: describePredicate(pred),
        message: `Authorization predicate not satisfied: ${describePredicate(pred)}.`,
      });
    }
  }
  return null;
}

function evaluatePredicate(pred: AuthPredicate, ctx: HandlerContext): boolean {
  if (pred === "ctx.user") return ctx.user !== null;
  if (typeof pred === "object" && pred !== null && "ctx.staff" in pred) {
    if (!ctx.staff) return false;
    return pred["ctx.staff"].includes(ctx.staff.role);
  }
  return false;
}

function describePredicate(pred: AuthPredicate): string {
  if (pred === "ctx.user") return "caller is signed in (ctx.user)";
  return `caller is staff with role in [${pred["ctx.staff"].join(", ")}]`;
}

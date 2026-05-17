import {
  makeDiagnostic,
  type AuthPredicate,
  type Diagnostic,
  type Phase,
} from "@aotterclam/mantle-spec";
import type { HandlerContext } from "../model/HandlerContext.js";

/**
 * Pure auth-predicate evaluator. Shared by `InvokeProcedureUseCase`
 * and `ExecuteViewUseCase` so the `requires.auth.all` semantics in the
 * manifest grammar produce identical runtime behavior across atoms.
 *
 * The closed predicate vocabulary (`ctx.user`, `{ ctx.staff: [<role>] }`)
 * is enforced at parse time; this evaluator trusts the shape and only
 * checks against the live `HandlerContext`.
 *
 * Domain-pure: no IO, no port deps. Lives in `domain/service/` because
 * both the procedure and view use cases need it; placing it in either
 * use case would create a usecase→usecase coupling.
 */

export interface AuthRequires {
  readonly auth?: { readonly all: readonly AuthPredicate[] };
}

/**
 * Evaluate `requires.auth.all` against `ctx`. Returns `null` when
 * authorization passes (or no `requires.auth.all` is declared), or an
 * `AUTH_DENIED` Diagnostic naming the first failing predicate.
 */
export function evaluateAuthAll(
  requires: AuthRequires | undefined,
  ctx: HandlerContext,
  path: string,
  phase: Phase,
): Diagnostic | null {
  const all = requires?.auth?.all;
  if (!all || all.length === 0) return null;
  for (let i = 0; i < all.length; i++) {
    const pred = all[i]!;
    if (!evaluatePredicate(pred, ctx)) {
      return makeDiagnostic({
        code: "AUTH_DENIED",
        phase,
        severity: "error",
        path: `${path}#/requires/auth/all/${i}`,
        expected: describePredicate(pred),
        message: `Authorization predicate not satisfied: ${describePredicate(pred)}.`,
      });
    }
  }
  return null;
}

export function evaluatePredicate(pred: AuthPredicate, ctx: HandlerContext): boolean {
  if (pred === "ctx.user") return ctx.user !== null;
  if (typeof pred === "object" && pred !== null && "ctx.staff" in pred) {
    if (!ctx.staff) return false;
    return pred["ctx.staff"].includes(ctx.staff.role);
  }
  return false;
}

export function describePredicate(pred: AuthPredicate): string {
  if (pred === "ctx.user") return "caller is signed in (ctx.user)";
  return `caller is staff with role in [${pred["ctx.staff"].join(", ")}]`;
}

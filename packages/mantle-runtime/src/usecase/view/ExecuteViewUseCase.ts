import {
  runtimeDiagnostic,
  type Diagnostic,
} from "@aotterclam/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import { compileView } from "../../domain/service/ViewSqlCompiler.js";
import type { ExecuteViewRequest } from "../dto/view/ExecuteViewRequest.js";

/**
 * Compile a View manifest and run it against `DatabaseDriver`. The
 * use case trusts a pre-coerced param map; per-request validation
 * against `View.spec.params` happens at the adapter (or via
 * `coerceViewParams`) before the request reaches here.
 */

export interface ViewQueryResult<R = Record<string, unknown>> {
  readonly rows: readonly R[];
  readonly page: number;
  readonly show: number;
  /** True when `rows.length === show` — there *might* be more on the
   *  next page. False guarantees no more. v0.1.0 takes the cheap
   *  path: no count query, no limit+1 probe. ADR-0012. */
  readonly hasMore: boolean;
}

export type ExecuteViewResponse<R = Record<string, unknown>> =
  | { readonly ok: true; readonly result: ViewQueryResult<R> }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

export class ExecuteViewUseCase {
  constructor(private readonly db: DatabaseDriver) {}

  async execute<R = Record<string, unknown>>(
    request: ExecuteViewRequest,
  ): Promise<ExecuteViewResponse<R>> {
    const viewPath = request.pathPrefix ?? `manifest:View/${request.view.metadata.name}`;
    let compiled;
    try {
      compiled = compileView(request.view, request.options);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "INTERNAL_ERROR",
          severity: "error",
          path: viewPath,
          expected: "View compiles to valid SQL",
          message: `View compile failed: ${msg}`,
        }),
      };
    }

    try {
      const rows = await this.db
        .prepare(compiled.sql)
        .bind(...compiled.params)
        .all<R>();
      return {
        ok: true,
        result: {
          rows,
          page: compiled.effectivePage,
          show: compiled.effectiveShow,
          hasMore: rows.length === compiled.effectiveShow,
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        diagnostic: runtimeDiagnostic({
          code: "INTERNAL_ERROR",
          severity: "error",
          path: viewPath,
          expected: "SQL executes without error",
          message: `View SQL execution failed: ${msg}`,
        }),
      };
    }
  }
}

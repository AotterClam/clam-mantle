import {
  runtimeDiagnostic,
  type Diagnostic,
  type ViewManifest,
} from "@aotter/mantle-spec";
import type { DatabaseDriver } from "../../domain/port/DatabaseDriver.js";
import { compileView } from "../../domain/service/ViewSqlCompiler.js";

/**
 * `ExecuteViewUseCase` — compile a View manifest and run it against
 * `DatabaseDriver`. JSON-extracted columns are returned as primitive
 * values (strings, numbers, `null`) by SQLite; pass-through with no
 * coercion.
 *
 * Public REST callers reach this via `mountServerEndpoints` after the
 * adapter has zod-coerced the query string against `View.spec.params`.
 * The use case itself trusts the resolved param map — it does not
 * re-validate against the JSON Schema. Pagination knobs `page` /
 * `show` arrive separately (the adapter strips them out before the
 * params map is built).
 *
 * Errors map to `INTERNAL_ERROR` with structured `path` so AI
 * consumers can locate the view by name.
 */
export interface ExecuteViewRequest {
  readonly view: ViewManifest;
  readonly pathPrefix?: string;
  /** Resolved query-string params — already coerced against
   *  `View.spec.params` by the calling adapter. */
  readonly params?: Record<string, unknown>;
  /** 1-indexed page number. Defaults to 1. */
  readonly page?: number;
  /** Page size requested by the caller. Clamped to View.spec.limit. */
  readonly show?: number;
}

export interface ViewQueryResult<R = Record<string, unknown>> {
  readonly rows: readonly R[];
  readonly page: number;
  readonly show: number;
  /** True when the result set was the full requested page size, so
   *  there *might* be more rows on the next page. False guarantees no
   *  more rows. v0.1.0 takes the cheap path: no count query, no
   *  limit+1 probe — laziness is documented in ADR-0012. */
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
      compiled = compileView(request.view, {
        params: request.params,
        page: request.page,
        show: request.show,
      });
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

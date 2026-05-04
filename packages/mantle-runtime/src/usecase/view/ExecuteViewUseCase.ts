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
 * Errors map to `INTERNAL_ERROR` with structured `path` so AI
 * consumers can locate the view by name.
 */
export interface ExecuteViewRequest {
  readonly view: ViewManifest;
  readonly pathPrefix?: string;
}

export interface ViewQueryResult<R = Record<string, unknown>> {
  readonly items: readonly R[];
  /** v0.1 returns null — cursor pagination is reserved. Authors
   *  shouldn't depend on this field's presence today; reserved so
   *  the wire shape stays stable when pagination lands. */
  readonly nextCursor: string | null;
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
      compiled = compileView(request.view);
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
      const items = await this.db
        .prepare(compiled.sql)
        .bind(...compiled.params)
        .all<R>();
      return { ok: true, result: { items, nextCursor: null } };
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

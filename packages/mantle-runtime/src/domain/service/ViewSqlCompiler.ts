import {
  DiagnosticError,
  isParamRef,
  runtimeDiagnostic,
  type FilterAst,
  type ViewManifest,
} from "@aotter/mantle-spec";

/**
 * View → SQL compilation. Targets SQLite + JSON1 (D1's dialect; also
 * Postgres-compatible enough for v0.2 via Hyperdrive).
 *
 *   - Reserved metadata fields (`id`, `status`, `version`, `createdAt`,
 *     `updatedAt`, `authorId`) are emitted as native columns.
 *   - Anything else (including `locale` per ADR-0010) is read via
 *     `json_extract(data, '$.<field>')`.
 *
 * Filter AST grammar is v0.1: `eq` / `and` / `or` only. `eq.value` may
 * be a literal or a `{ $param: <name> }` sentinel; the parser already
 * rejected DRAFT operators and validated that every paramRef'd name
 * lives in `View.spec.params.required`.
 *
 * Pagination is owned by the runtime — public REST callers send
 * `?page=&show=`; this compiler emits `LIMIT show OFFSET (page-1)*show`
 * after clamping `show` to `min(show, View.spec.limit ?? DEFAULT_LIMIT)`.
 *
 * SQL is built with positional parameters (`?`). Author-facing field
 * names should already be JSON-safe identifiers (Schema validator
 * gate); the escapes here are defense-in-depth.
 *
 * Pure stateless service — no I/O. Lives in `domain/service/`.
 */
export interface CompiledView {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly effectivePage: number;
  readonly effectiveShow: number;
}

export interface CompileViewOptions {
  /** Resolved query-string params (post zod-coercion). Substituted
   *  into filter `{ $param: <name> }` sentinels. */
  readonly params?: Record<string, unknown>;
  /** 1-indexed page number. Defaults to 1. Non-positive / non-finite
   *  values fall back to 1. */
  readonly page?: number;
  /** Page size requested by the caller. Clamped at runtime to the
   *  View's declared `spec.limit` (or DEFAULT_LIMIT when absent). */
  readonly show?: number;
}

const RESERVED_COLUMN: Readonly<Record<string, string>> = {
  id: "id",
  status: "status",
  version: "version",
  createdAt: "created_at",
  updatedAt: "updated_at",
  authorId: "author_id",
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export function compileView(view: ViewManifest, options: CompileViewOptions = {}): CompiledView {
  const sqlParams: unknown[] = [];
  const selectExpr = buildSelect(view.spec.fields);
  const whereParts: string[] = ["collection = ?"];
  sqlParams.push(view.spec.from);
  if (view.spec.filter) {
    const filterSql = compileFilter(view.spec.filter, sqlParams, options.params ?? {});
    if (filterSql !== null) whereParts.push(`(${filterSql})`);
  }
  const where = `WHERE ${whereParts.join(" AND ")}`;
  const orderBy = buildOrderBy(view.spec.orderBy);
  const effectiveShow = clampShow(options.show, view.spec.limit);
  const effectivePage = clampPage(options.page);
  const offset = (effectivePage - 1) * effectiveShow;
  const sql = `SELECT ${selectExpr} FROM entries ${where}${orderBy} LIMIT ${effectiveShow} OFFSET ${offset}`;
  return { sql, params: sqlParams, effectivePage, effectiveShow };
}

function buildSelect(fields?: readonly string[]): string {
  if (!fields || fields.length === 0) {
    return Object.entries(RESERVED_COLUMN)
      .map(([alias, col]) => (alias === col ? col : `${col} AS ${alias}`))
      .join(", ");
  }
  return fields.map(fieldExpr).join(", ");
}

function fieldExpr(field: string): string {
  const reserved = RESERVED_COLUMN[field];
  if (reserved) {
    return reserved === field ? reserved : `${reserved} AS ${field}`;
  }
  return `json_extract(data, '$.${escapeJsonKey(field)}') AS ${quoteIdent(field)}`;
}

function fieldRefExpr(field: string): string {
  const reserved = RESERVED_COLUMN[field];
  if (reserved) return reserved;
  return `json_extract(data, '$.${escapeJsonKey(field)}')`;
}

/**
 * Compile one filter node. Returns `null` when the node should be
 * treated as TRUE — happens when an `eq` node references a param via
 * `{ $param: <name> }` and the resolved value is `undefined` (i.e. the
 * caller didn't supply it). v0.1.0 parser enforces required-only param
 * refs, so this drop path is dead code today; it lives here so v0.1.x
 * "optional param ref" promotion is purely a parser change.
 *
 * AND / OR fold over their children: any child that returns `null`
 * drops out. An AND/OR whose children all dropped returns `null` (no
 * constraint) — "missing constraint" is treated as TRUE for both
 * operators in v0.1.0 (documented in ADR-0012).
 */
function compileFilter(
  node: FilterAst,
  sqlParams: unknown[],
  paramValues: Record<string, unknown>,
): string | null {
  if ("eq" in node) {
    const value = node.eq.value;
    if (isParamRef(value)) {
      const resolved = paramValues[value.$param];
      if (resolved === undefined) return null;
      sqlParams.push(resolved);
    } else {
      sqlParams.push(value);
    }
    return `${fieldRefExpr(node.eq.field)} = ?`;
  }
  if ("and" in node) {
    const parts = node.and
      .map((c) => compileFilter(c, sqlParams, paramValues))
      .filter((p): p is string => p !== null);
    if (parts.length === 0) return null;
    return parts.map((p) => `(${p})`).join(" AND ");
  }
  const parts = node.or
    .map((c) => compileFilter(c, sqlParams, paramValues))
    .filter((p): p is string => p !== null);
  if (parts.length === 0) return null;
  return parts.map((p) => `(${p})`).join(" OR ");
}

function buildOrderBy(
  orderBy?: ReadonlyArray<{ readonly field: string; readonly direction?: "asc" | "desc" }>,
): string {
  if (!orderBy || orderBy.length === 0) return "";
  const parts = orderBy.map((o) => {
    const dir = (o.direction ?? "asc").toUpperCase();
    return `${fieldRefExpr(o.field)} ${dir}`;
  });
  return ` ORDER BY ${parts.join(", ")}`;
}

function clampShow(show: number | undefined, viewLimit: number | undefined): number {
  const cap = clampLimit(viewLimit);
  if (typeof show !== "number" || !Number.isFinite(show) || show <= 0) return cap;
  return Math.min(Math.floor(show), cap);
}

function clampPage(page: number | undefined): number {
  if (typeof page !== "number" || !Number.isFinite(page) || page < 1) return 1;
  return Math.floor(page);
}

function clampLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

function escapeJsonKey(key: string): string {
  if (key.includes("\\")) {
    throw new DiagnosticError(
      runtimeDiagnostic({
        code: "INTERNAL_ERROR",
        severity: "error",
        path: "compileView/escapeJsonKey",
        value: key,
        expected: "field name without backslashes (Schema validator gate)",
        message: `field name '${key}' contains a backslash; Schema validation should have caught this.`,
      }),
    );
  }
  return key.replace(/'/g, "''");
}

function quoteIdent(name: string): string {
  if (name.includes('"')) {
    throw new DiagnosticError(
      runtimeDiagnostic({
        code: "INTERNAL_ERROR",
        severity: "error",
        path: "compileView/quoteIdent",
        value: name,
        expected: "field name without double-quotes (Schema validator gate)",
        message: `field name '${name}' contains a double-quote; Schema validation should have caught this.`,
      }),
    );
  }
  return `"${name}"`;
}

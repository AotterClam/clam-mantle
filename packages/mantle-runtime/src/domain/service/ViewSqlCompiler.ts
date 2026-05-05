import {
  DiagnosticError,
  isParamRef,
  runtimeDiagnostic,
  type FilterAst,
  type ViewManifest,
} from "@aotter/mantle-spec";
import { clampPage, clampShow } from "./Pagination.js";

/**
 * View → SQL compilation. Targets SQLite + JSON1 (D1's dialect).
 * Reserved metadata fields project as native columns; everything else
 * goes through `json_extract(data, '$.<field>')`. SQL uses positional
 * `?` parameters; field-name escapes are defense-in-depth on top of
 * the Schema validator gate.
 *
 * v0.1 filter AST is `eq | and | or`; `eq.value` may be a literal or a
 * `{ $param: <name> }` sentinel substituted from `options.params` at
 * compile time. Pagination knobs `page` / `show` come in via
 * `options`; the runtime owns the LIMIT/OFFSET emission.
 */
export interface CompiledView {
  readonly sql: string;
  readonly params: readonly unknown[];
  readonly effectivePage: number;
  readonly effectiveShow: number;
}

export interface CompileViewOptions {
  /** Resolved query-string params, post-coercion. */
  readonly params?: Record<string, unknown>;
  /** 1-indexed; non-positive / non-finite falls back to 1. */
  readonly page?: number;
  /** Caller's requested page size; clamped to View.spec.limit. */
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

const DEFAULT_PROJECTION = Object.entries(RESERVED_COLUMN)
  .map(([alias, col]) => (alias === col ? col : `${col} AS ${alias}`))
  .join(", ");

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
  if (!fields || fields.length === 0) return DEFAULT_PROJECTION;
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
 * Returns `null` when the node should evaluate to TRUE (no constraint).
 * That happens when an `eq` references a param via `{ $param: <name> }`
 * and the resolved value is `undefined`. v0.1.0 parser enforces
 * required-only param refs, so this drop path is dead code today; it
 * lives here so v0.1.x "optional param ref" promotion is purely a
 * parser change. AND/OR fold over their children: any null child
 * drops; an AND/OR whose children all drop returns null itself.
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

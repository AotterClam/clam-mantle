import {
  DiagnosticError,
  runtimeDiagnostic,
  type FilterAst,
  type ViewManifest,
} from "@aotterclam/clam-cms-spec";

/**
 * View → SQL compilation. Targets SQLite + JSON1 (D1's dialect; also
 * Postgres-compatible enough for v0.2 via Hyperdrive).
 *
 *   - Reserved metadata fields (`id`, `status`, `version`, `createdAt`,
 *     `updatedAt`, `authorId`) are emitted as native columns.
 *   - Anything else (including `locale` per ADR-0010) is read via
 *     `json_extract(data, '$.<field>')`.
 *
 * Filter AST grammar is v0.1: `eq` / `and` / `or` only. Parser already
 * rejects DRAFT operators (`contains`, `not`, `in`, `like`, `recursive`,
 * `gatedBy`, `join.aggregate`); the compiler trusts well-formed input.
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

export function compileView(view: ViewManifest): CompiledView {
  const params: unknown[] = [];
  const selectExpr = buildSelect(view.spec.fields);
  const whereParts: string[] = ["collection = ?"];
  params.push(view.spec.from);
  if (view.spec.filter) {
    whereParts.push(`(${compileFilter(view.spec.filter, params)})`);
  }
  const where = `WHERE ${whereParts.join(" AND ")}`;
  const orderBy = buildOrderBy(view.spec.orderBy);
  const limit = clampLimit(view.spec.limit);
  const sql = `SELECT ${selectExpr} FROM entries ${where}${orderBy} LIMIT ${limit}`;
  return { sql, params };
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

function compileFilter(node: FilterAst, params: unknown[]): string {
  if ("eq" in node) {
    params.push(node.eq.value);
    return `${fieldRefExpr(node.eq.field)} = ?`;
  }
  if ("and" in node) {
    return node.and.map((c) => `(${compileFilter(c, params)})`).join(" AND ");
  }
  return node.or.map((c) => `(${compileFilter(c, params)})`).join(" OR ");
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

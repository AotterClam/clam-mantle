import type {
  BatchResult,
  DatabaseDriver,
  Migration,
  MigrationRunner,
  PreparedStatement,
  RunResult,
} from "@aotter/mantle-runtime";

/**
 * `DatabaseDriver` impl wrapping Cloudflare's `D1Database` binding.
 *
 * The runtime port shape is intentionally close to D1's API (which is
 * itself close to the SQLite C API), so this wrapper is mostly a
 * type-narrowing pass-through. The notable behaviour is the
 * `D1Migrations` runner: it records applied migrations in a
 * `_mantle_migrations` table so subsequent boots are idempotent.
 *
 * Per ADR-0011 the runtime never imports `D1Database` itself — this
 * file is the only place in the codebase that does.
 */
export class D1DatabaseDriver implements DatabaseDriver {
  readonly migrations: MigrationRunner;

  constructor(private readonly db: D1Database) {
    this.migrations = new D1Migrations(db);
  }

  prepare(sql: string): PreparedStatement {
    return wrap(this.db.prepare(sql));
  }

  async batch(stmts: ReadonlyArray<PreparedStatement>): Promise<readonly BatchResult[]> {
    const native = stmts.map((s) => unwrap(s));
    const results = await this.db.batch(native);
    return results.map((r) => ({
      success: r.success,
      meta: { changes: r.meta.changes ?? 0 },
      results: r.results as ReadonlyArray<Record<string, unknown>> | undefined,
    }));
  }
}

const NATIVE: WeakMap<PreparedStatement, D1PreparedStatement> = new WeakMap();

function wrap(native: D1PreparedStatement): PreparedStatement {
  const stmt: PreparedStatement = {
    bind: (...params) => wrap(native.bind(...params)),
    first: <T = Record<string, unknown>>() => native.first<T>().then((v) => v ?? null),
    all: async <T = Record<string, unknown>>() => {
      const r = await native.all<T>();
      return (r.results ?? []) as readonly T[];
    },
    run: async (): Promise<RunResult> => {
      const r = await native.run();
      return {
        success: r.success,
        meta: { changes: r.meta.changes ?? 0, lastRowId: r.meta.last_row_id },
      };
    },
  };
  NATIVE.set(stmt, native);
  return stmt;
}

function unwrap(stmt: PreparedStatement): D1PreparedStatement {
  const native = NATIVE.get(stmt);
  if (!native) {
    throw new Error(
      "D1DatabaseDriver.batch received a statement not produced by this driver. " +
        "Build statements via `db.prepare(...)` on the same DatabaseDriver instance.",
    );
  }
  return native;
}

class D1Migrations implements MigrationRunner {
  constructor(private readonly db: D1Database) {}

  async runAll(migrations: ReadonlyArray<Migration>): Promise<void> {
    await this.db
      .prepare(
        `CREATE TABLE IF NOT EXISTS _mantle_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`,
      )
      .run();
    const applied = await this.db
      .prepare(`SELECT id FROM _mantle_migrations`)
      .all<{ id: string }>();
    const seen = new Set((applied.results ?? []).map((r) => r.id));
    for (const m of migrations) {
      if (seen.has(m.id)) continue;
      const statements = splitSql(m.sql);
      const ops: D1PreparedStatement[] = statements.map((s) => this.db.prepare(s));
      ops.push(
        this.db
          .prepare(`INSERT INTO _mantle_migrations (id, applied_at) VALUES (?, ?)`)
          .bind(m.id, Date.now()),
      );
      await this.db.batch(ops);
    }
  }
}

/**
 * D1 / SQLite accept multi-statement SQL on the wire, but `.batch`
 * expects each statement separately. Splitting on `;` is correct for
 * our migration corpus (DDL + INSERT seeds, no string literals
 * containing `;`). When that ever stops being true, switch to a
 * lexer-aware split.
 */
function splitSql(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

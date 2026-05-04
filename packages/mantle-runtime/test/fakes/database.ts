import type {
  BatchResult,
  DatabaseDriver,
  Migration,
  MigrationRunner,
  PreparedStatement,
  RunResult,
} from "../../src/domain/port/DatabaseDriver.js";

/**
 * Tiny SQL-aware in-memory `DatabaseDriver`. Pattern-matches the queries
 * the runtime actually emits — not a general SQL engine. Queries
 * outside the supported set throw with the offending SQL so a
 * diverging test is easy to diagnose.
 *
 * Tables modelled: `entries`, `revisions`, `approvals`, `users`,
 * `staff`, `sessions`, `site_config`. Migrations runner records
 * applied ids in a Set; no DDL execution.
 */
interface EntryRecord {
  id: string;
  collection: string;
  status: string;
  version: number;
  data: string;
  author_id: string | null;
  created_at: number;
  updated_at: number;
}
interface StaffRecord {
  user_id: string;
  role: string;
  granted_by: string | null;
  granted_at: number;
}
interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  created_at: number;
}

export class InMemoryDatabase implements DatabaseDriver {
  entries = new Map<string, EntryRecord>();
  revisions = new Map<string, { entry_id: string }>();
  approvals = new Map<string, { entry_id: string }>();
  staff = new Map<string, StaffRecord>();
  users = new Map<string, UserRecord>();
  siteConfig = new Map<string, string>();
  appliedMigrations = new Set<string>();

  prepare(sql: string): PreparedStatement {
    return new InMemoryStatement(this, normalize(sql), []);
  }

  async batch(stmts: ReadonlyArray<PreparedStatement>): Promise<readonly BatchResult[]> {
    const out: BatchResult[] = [];
    for (const s of stmts) {
      const r = await s.run();
      out.push({ success: true, meta: { changes: r.meta.changes } });
    }
    return out;
  }

  migrations: MigrationRunner = {
    runAll: async (migs: ReadonlyArray<Migration>) => {
      for (const m of migs) this.appliedMigrations.add(m.id);
    },
  };

  /** Test seed helpers. */
  _seedUser(u: UserRecord): void {
    this.users.set(u.id, u);
  }
  _seedStaff(s: StaffRecord): void {
    this.staff.set(s.user_id, s);
  }
}

class InMemoryStatement implements PreparedStatement {
  constructor(
    private readonly db: InMemoryDatabase,
    private readonly sql: string,
    private readonly params: readonly unknown[],
  ) {}

  bind(...params: ReadonlyArray<unknown>): PreparedStatement {
    return new InMemoryStatement(this.db, this.sql, params);
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const { rows } = this.execute();
    return (rows[0] as T | undefined) ?? null;
  }

  async all<T = Record<string, unknown>>(): Promise<readonly T[]> {
    return this.execute().rows as T[];
  }

  async run(): Promise<RunResult> {
    const { changes } = this.execute();
    return { success: true, meta: { changes } };
  }

  private execute(): { rows: Record<string, unknown>[]; changes: number } {
    const sql = this.sql;
    const p = this.params;

    // INSERT INTO entries
    if (sql.startsWith("INSERT INTO entries")) {
      const [id, collection, status, data, author_id, created_at, updated_at] = p as [
        string, string, string, string, string | null, number, number,
      ];
      this.db.entries.set(id, {
        id,
        collection,
        status,
        version: 1,
        data,
        author_id,
        created_at,
        updated_at,
      });
      return { rows: [], changes: 1 };
    }

    // SELECT … FROM entries WHERE id = ?
    if (
      sql.startsWith("SELECT id, collection, status, version, data, author_id, created_at, updated_at FROM entries WHERE id = ?") ||
      sql.startsWith("SELECT id, collection, status, version, data, created_at, updated_at FROM entries WHERE id = ?")
    ) {
      const r = this.db.entries.get(p[0] as string);
      return { rows: r ? [r as unknown as Record<string, unknown>] : [], changes: 0 };
    }

    // SELECT status FROM entries WHERE id = ?
    if (sql.startsWith("SELECT status FROM entries WHERE id = ?")) {
      const r = this.db.entries.get(p[0] as string);
      return { rows: r ? [{ status: r.status }] : [], changes: 0 };
    }

    // SELECT version FROM entries WHERE id = ?
    if (sql.startsWith("SELECT version FROM entries WHERE id = ?")) {
      const r = this.db.entries.get(p[0] as string);
      return { rows: r ? [{ version: r.version }] : [], changes: 0 };
    }

    // UPDATE entries SET data = ?, version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING …
    if (sql.startsWith("UPDATE entries SET data = ?, version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING")) {
      const [data, version, updated_at, id, expected] = p as [string, number, number, string, number];
      const r = this.db.entries.get(id);
      if (!r || r.version !== expected) return { rows: [], changes: 0 };
      r.data = data;
      r.version = version;
      r.updated_at = updated_at;
      return { rows: [r as unknown as Record<string, unknown>], changes: 1 };
    }

    // UPDATE entries SET status = 'archived', version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING …
    if (sql.startsWith("UPDATE entries SET status = 'archived', version = ?, updated_at = ? WHERE id = ? AND version = ? RETURNING")) {
      const [version, updated_at, id, expected] = p as [number, number, string, number];
      const r = this.db.entries.get(id);
      if (!r || r.version !== expected) return { rows: [], changes: 0 };
      r.status = "archived";
      r.version = version;
      r.updated_at = updated_at;
      return { rows: [r as unknown as Record<string, unknown>], changes: 1 };
    }

    // UPDATE entries SET status = ?, version = version + 1, updated_at = ? WHERE id = ? [AND status = ?] RETURNING …
    if (sql.startsWith("UPDATE entries SET status = ?, version = version + 1, updated_at = ? WHERE id = ?")) {
      const guarded = sql.includes("AND status = ?");
      if (guarded) {
        const [to, updated_at, id, expectedStatus] = p as [string, number, string, string];
        const r = this.db.entries.get(id);
        if (!r || r.status !== expectedStatus) return { rows: [], changes: 0 };
        r.status = to;
        r.version = r.version + 1;
        r.updated_at = updated_at;
        return { rows: [r as unknown as Record<string, unknown>], changes: 1 };
      }
      const [to, updated_at, id] = p as [string, number, string];
      const r = this.db.entries.get(id);
      if (!r) return { rows: [], changes: 0 };
      r.status = to;
      r.version = r.version + 1;
      r.updated_at = updated_at;
      return { rows: [r as unknown as Record<string, unknown>], changes: 1 };
    }

    // SELECT … FROM entries WHERE collection = ? [AND status = ?] ORDER BY updated_at DESC LIMIT ?
    if (sql.startsWith("SELECT id, collection, status, version, data, author_id, created_at, updated_at FROM entries WHERE collection = ?")) {
      const hasStatus = sql.includes("AND status = ?");
      const collection = p[0] as string;
      const status = hasStatus ? (p[1] as string) : null;
      const limit = (hasStatus ? (p[2] as number) : (p[1] as number)) ?? 100;
      const filtered = [...this.db.entries.values()]
        .filter((r) => r.collection === collection)
        .filter((r) => (status ? r.status === status : true))
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, limit);
      return { rows: filtered.map((r) => ({ ...r })), changes: 0 };
    }

    // DELETE FROM entries WHERE id = ?
    if (sql.startsWith("DELETE FROM entries WHERE id = ?")) {
      const removed = this.db.entries.delete(p[0] as string);
      return { rows: [], changes: removed ? 1 : 0 };
    }
    // DELETE FROM revisions WHERE entry_id = ?
    if (sql.startsWith("DELETE FROM revisions WHERE entry_id = ?")) {
      const eid = p[0] as string;
      let n = 0;
      for (const [k, v] of this.db.revisions) {
        if (v.entry_id === eid) {
          this.db.revisions.delete(k);
          n++;
        }
      }
      return { rows: [], changes: n };
    }
    // DELETE FROM approvals WHERE entry_id = ?
    if (sql.startsWith("DELETE FROM approvals WHERE entry_id = ?")) {
      const eid = p[0] as string;
      let n = 0;
      for (const [k, v] of this.db.approvals) {
        if (v.entry_id === eid) {
          this.db.approvals.delete(k);
          n++;
        }
      }
      return { rows: [], changes: n };
    }

    // INSERT INTO site_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING
    if (sql.startsWith("INSERT INTO site_config (key, value) VALUES (?, ?) ON CONFLICT(key) DO NOTHING")) {
      const [key, value] = p as [string, string];
      if (!this.db.siteConfig.has(key)) {
        this.db.siteConfig.set(key, value);
        return { rows: [], changes: 1 };
      }
      return { rows: [], changes: 0 };
    }
    // SELECT key, value FROM site_config
    if (sql.startsWith("SELECT key, value FROM site_config")) {
      return {
        rows: [...this.db.siteConfig.entries()].map(([key, value]) => ({ key, value })),
        changes: 0,
      };
    }
    // SELECT value FROM site_config WHERE key = ?
    if (sql.startsWith("SELECT value FROM site_config WHERE key = ?")) {
      const key = p[0] as string;
      const v = this.db.siteConfig.get(key);
      return { rows: v !== undefined ? [{ value: v }] : [], changes: 0 };
    }

    // SELECT user_id, role, granted_by, granted_at FROM staff WHERE user_id = ?
    if (sql.startsWith("SELECT user_id, role, granted_by, granted_at FROM staff WHERE user_id = ?")) {
      const r = this.db.staff.get(p[0] as string);
      return { rows: r ? [r as unknown as Record<string, unknown>] : [], changes: 0 };
    }
    // SELECT s.user_id, s.role, u.email, u.name FROM staff s INNER JOIN users u ON u.id = s.user_id WHERE s.user_id = ?
    if (sql.startsWith("SELECT s.user_id, s.role, u.email, u.name FROM staff s INNER JOIN users u ON u.id = s.user_id WHERE s.user_id = ?")) {
      const userId = p[0] as string;
      const s = this.db.staff.get(userId);
      const u = this.db.users.get(userId);
      if (!s || !u) return { rows: [], changes: 0 };
      return {
        rows: [{ user_id: s.user_id, role: s.role, email: u.email, name: u.name }],
        changes: 0,
      };
    }

    // Publish read paths — SELECT id, collection, status, version, data, created_at, updated_at FROM entries WHERE …
    if (sql.startsWith("SELECT id, collection, status, version, data, created_at, updated_at FROM entries WHERE")) {
      const tail = sql.slice("SELECT id, collection, status, version, data, created_at, updated_at FROM entries WHERE ".length);
      const rest = tail.replace(/ ORDER BY updated_at DESC$/, "");
      const conds = rest.split(" AND ");
      const matchedRows = [...this.db.entries.values()].filter((r) => {
        let pi = 0;
        for (const cond of conds) {
          if (cond === `status = 'published'`) {
            if (r.status !== "published") return false;
          } else if (cond === `json_extract(data, '$.locale') IS NULL`) {
            const data = JSON.parse(r.data) as Record<string, unknown>;
            if (typeof data["locale"] === "string") return false;
          } else if (cond === `json_extract(data, '$.locale') = ?`) {
            const want = p[pi++] as string;
            const data = JSON.parse(r.data) as Record<string, unknown>;
            if (data["locale"] !== want) return false;
          } else if (cond === `collection = ?`) {
            if (r.collection !== (p[pi++] as string)) return false;
          } else {
            throw new Error(`fake DB: unsupported cond '${cond}' in publish read SELECT`);
          }
        }
        return true;
      });
      matchedRows.sort((a, b) => b.updated_at - a.updated_at);
      return { rows: matchedRows.map((r) => ({ ...r })), changes: 0 };
    }

    // View-compiled SELECT: starts with SELECT and FROM entries WHERE collection = ? …
    if (sql.startsWith("SELECT") && sql.includes("FROM entries") && sql.includes("WHERE collection = ?")) {
      return { rows: runCompiledViewQuery(this.db, sql, p), changes: 0 };
    }

    throw new Error(`fake DB: unsupported SQL: ${sql}`);
  }
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

/**
 * Runs a compiled View SELECT against the in-memory store. Supports
 * the projection + filter shapes the View compiler emits — reserved
 * columns, `json_extract(data, '$.field')` extraction, `eq` filters
 * combined with AND/OR.
 */
function runCompiledViewQuery(
  db: InMemoryDatabase,
  sql: string,
  params: readonly unknown[],
): Record<string, unknown>[] {
  const fromIdx = sql.indexOf(" FROM entries");
  const projection = sql.slice("SELECT".length, fromIdx).trim();
  const afterFrom = sql.slice(fromIdx + " FROM entries".length).trim();
  // afterFrom: WHERE collection = ? [AND (filter)] [ORDER BY …] LIMIT N
  const whereIdx = afterFrom.indexOf("WHERE ");
  const limitIdx = afterFrom.lastIndexOf(" LIMIT ");
  const orderIdx = afterFrom.indexOf(" ORDER BY ");
  const whereTail = afterFrom.slice(
    whereIdx + "WHERE ".length,
    orderIdx >= 0 ? orderIdx : limitIdx,
  );
  const orderClause = orderIdx >= 0
    ? afterFrom.slice(orderIdx + " ORDER BY ".length, limitIdx)
    : null;
  const limit = parseInt(afterFrom.slice(limitIdx + " LIMIT ".length).trim(), 10);

  // collection = ? is always first; everything after AND is a filter.
  const collectionMatch = whereTail.match(/^collection = \?/);
  if (!collectionMatch) throw new Error(`fake DB: view query missing collection: ${sql}`);
  const collection = params[0] as string;
  const remaining = whereTail.slice("collection = ?".length).trim();
  const filterExpr = remaining.startsWith("AND ")
    ? remaining.slice("AND ".length).trim()
    : "";

  let consumed = 1;
  const matchFilter = (row: EntryRecord, expr: string): boolean => {
    if (!expr) return true;
    return evalExpr(row, expr.replace(/^\((.*)\)$/, "$1"));
  };

  const evalExpr = (row: EntryRecord, expr: string): boolean => {
    // Strip outer parens.
    let cleaned = expr.trim();
    while (cleaned.startsWith("(") && matchClose(cleaned, 0) === cleaned.length - 1) {
      cleaned = cleaned.slice(1, -1).trim();
    }
    const top = splitTopLevel(cleaned);
    if (top.op === "AND") return top.parts.every((part) => evalExpr(row, part));
    if (top.op === "OR") return top.parts.some((part) => evalExpr(row, part));
    return evalAtom(row, cleaned);
  };

  const evalAtom = (row: EntryRecord, atom: string): boolean => {
    const eqMatch = atom.match(/^(.+?)\s*=\s*\?$/);
    if (!eqMatch) throw new Error(`fake DB: unsupported atom '${atom}'`);
    const lhs = eqMatch[1]!.trim();
    const value = params[consumed++];
    return readValue(row, lhs) === value;
  };

  const filtered = [...db.entries.values()]
    .filter((r) => r.collection === collection)
    .filter((r) => matchFilter(r, filterExpr));

  if (orderClause) {
    const parts = orderClause.split(",").map((s) => s.trim());
    filtered.sort((a, b) => {
      for (const part of parts) {
        const m = part.match(/^(.+?)\s+(ASC|DESC)$/i) ?? [null, part, "ASC"];
        const fieldExpr = String(m[1]).trim();
        const direction = String(m[2] ?? "ASC").toUpperCase();
        const av = readValue(a, fieldExpr);
        const bv = readValue(b, fieldExpr);
        if (av === bv) continue;
        const cmp = (av as number | string) > (bv as number | string) ? 1 : -1;
        return direction === "DESC" ? -cmp : cmp;
      }
      return 0;
    });
  }

  return filtered.slice(0, limit).map((r) => projectRow(r, projection));
}

function readValue(row: EntryRecord, ref: string): unknown {
  if (ref === "id") return row.id;
  if (ref === "status") return row.status;
  if (ref === "version") return row.version;
  if (ref === "created_at") return row.created_at;
  if (ref === "updated_at") return row.updated_at;
  if (ref === "author_id") return row.author_id;
  const m = ref.match(/^json_extract\(data, '\$\.([^']+)'\)$/);
  if (m) {
    const key = m[1]!;
    const data = JSON.parse(row.data) as Record<string, unknown>;
    return data[key];
  }
  throw new Error(`fake DB: unsupported field ref '${ref}'`);
}

function projectRow(row: EntryRecord, projection: string): Record<string, unknown> {
  const parts = projection.split(",").map((s) => s.trim());
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    if (part === "id") out["id"] = row.id;
    else if (part === "status") out["status"] = row.status;
    else if (part === "version") out["version"] = row.version;
    else if (part === "created_at AS createdAt") out["createdAt"] = row.created_at;
    else if (part === "updated_at AS updatedAt") out["updatedAt"] = row.updated_at;
    else if (part === "author_id AS authorId") out["authorId"] = row.author_id;
    else if (part === "data") out["data"] = row.data;
    else {
      const aliasMatch = part.match(/^json_extract\(data, '\$\.([^']+)'\) AS "([^"]+)"$/);
      if (aliasMatch) {
        const data = JSON.parse(row.data) as Record<string, unknown>;
        out[aliasMatch[2]!] = data[aliasMatch[1]!];
      } else {
        throw new Error(`fake DB: unsupported view projection part '${part}'`);
      }
    }
  }
  return out;
}

function matchClose(s: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Split a SQL expression at the top-level AND or OR. Handles nested
 * parens: `a AND (b OR c)` → AND parts `["a", "(b OR c)"]`.
 */
function splitTopLevel(expr: string): { op: "AND" | "OR" | null; parts: string[] } {
  const tokens = tokenizeBoolean(expr);
  if (tokens.opCount === 0) return { op: null, parts: [expr] };
  if (tokens.hasAnd && tokens.hasOr) {
    // Mixed at top level isn't emitted by the compiler, but if it were
    // the compiler parenthesises one side. Fall through as AND for
    // pragmatic test coverage — extend if a real test fails.
    return { op: "AND", parts: tokens.parts };
  }
  return { op: tokens.hasAnd ? "AND" : "OR", parts: tokens.parts };
}

function tokenizeBoolean(expr: string): {
  opCount: number;
  hasAnd: boolean;
  hasOr: boolean;
  parts: string[];
} {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let opCount = 0;
  let hasAnd = false;
  let hasOr = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]!;
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0) {
      if (expr.startsWith(" AND ", i)) {
        parts.push(cur);
        cur = "";
        i += 4;
        opCount++;
        hasAnd = true;
        continue;
      }
      if (expr.startsWith(" OR ", i)) {
        parts.push(cur);
        cur = "";
        i += 3;
        opCount++;
        hasOr = true;
        continue;
      }
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return { opCount, hasAnd, hasOr, parts };
}

import type { Migration } from "../../domain/port/DatabaseDriver.js";

/**
 * Canonical migration list — the runtime owns the schema; adapters
 * just execute. Order is the array index. Migration `id` strings are
 * stable forever — never reused, never renamed; the `_migrations`
 * tracking table records them so subsequent boots are idempotent.
 *
 * Keep this list append-only. To change a table's shape, ship a new
 * `ALTER TABLE` migration with a new id.
 */
export const CANONICAL_MIGRATIONS: readonly Migration[] = [
  {
    id: "0001-init",
    description: "initial v0.1.0 schema: entries, revisions, approvals, users, staff, sessions, site_config",
    sql: `
      CREATE TABLE IF NOT EXISTS entries (
        id          TEXT PRIMARY KEY,
        collection  TEXT NOT NULL,
        status      TEXT NOT NULL,
        version     INTEGER NOT NULL DEFAULT 1,
        data        TEXT NOT NULL,
        author_id   TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS entries_by_collection_updated
        ON entries (collection, updated_at DESC);
      CREATE INDEX IF NOT EXISTS entries_by_collection_status
        ON entries (collection, status);

      CREATE TABLE IF NOT EXISTS revisions (
        id          TEXT PRIMARY KEY,
        entry_id    TEXT NOT NULL,
        version     INTEGER NOT NULL,
        data        TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        author_id   TEXT,
        note        TEXT
      );
      CREATE INDEX IF NOT EXISTS revisions_by_entry_version
        ON revisions (entry_id, version DESC);

      CREATE TABLE IF NOT EXISTS approvals (
        id            TEXT PRIMARY KEY,
        entry_id      TEXT NOT NULL,
        requested_by  TEXT NOT NULL,
        requested_at  INTEGER NOT NULL,
        note          TEXT,
        status        TEXT NOT NULL,
        resolved_by   TEXT,
        resolved_at   INTEGER
      );
      CREATE INDEX IF NOT EXISTS approvals_by_entry
        ON approvals (entry_id);

      CREATE TABLE IF NOT EXISTS users (
        id           TEXT PRIMARY KEY,
        github_id    INTEGER UNIQUE,
        github_login TEXT,
        email        TEXT,
        name         TEXT,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS github_tokens (
        user_id      TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        scope        TEXT NOT NULL,
        updated_at   INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS staff (
        user_id     TEXT PRIMARY KEY,
        role        TEXT NOT NULL,
        granted_by  TEXT,
        granted_at  INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token       TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        expires_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_by_user
        ON sessions (user_id);

      CREATE TABLE IF NOT EXISTS site_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

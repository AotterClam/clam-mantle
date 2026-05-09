import type { Migration } from "../../domain/port/DatabaseDriver.js";

/**
 * Canonical migration list — the runtime owns the schema; adapters
 * just execute. Order is the array index. Migration `id` strings are
 * stable forever — never reused, never renamed; the `_migrations`
 * tracking table records them so subsequent boots are idempotent.
 *
 * Keep this list append-only. To change a table's shape, ship a new
 * `ALTER TABLE` migration with a new id.
 *
 * Pre-v0.1.0 only: this list is still reshaped freely because nothing
 * has shipped yet. From v0.1.0 onwards it's strictly append-only.
 */
export const CANONICAL_MIGRATIONS: readonly Migration[] = [
  {
    id: "0001-init",
    description:
      "v0.1.0 schema: content (entries / revisions / approvals / site_config) + Better Auth (user / session / account / verification + admin plugin fields + mcp/oidc-provider plugin tables) per ADR-0014",
    // Auth tables are owned by Better Auth (per ADR-0014). For SQLite,
    // Better Auth's adapter sets `supportsDates: false` +
    // `supportsBooleans: false`, so date values are stored as ISO 8601
    // strings (TEXT) and booleans as 0/1 (INTEGER). Column types follow
    // Better Auth's getMigrations type map for the `sqlite` provider.
    sql: `
      -- =========================================================
      -- Content tables (clam-cms runtime — entries / revisions /
      -- approvals / site_config)
      -- =========================================================

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

      CREATE TABLE IF NOT EXISTS site_config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      -- =========================================================
      -- Better Auth tables (ADR-0014). Singular names by convention.
      -- =========================================================

      -- user (with admin plugin fields + githubLogin custom field)
      CREATE TABLE IF NOT EXISTS user (
        id            TEXT PRIMARY KEY NOT NULL,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image         TEXT,
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL,
        role          TEXT,
        banned        INTEGER DEFAULT 0,
        banReason     TEXT,
        banExpires    TEXT,
        githubLogin   TEXT
      );

      -- session (with admin plugin impersonatedBy field)
      CREATE TABLE IF NOT EXISTS session (
        id             TEXT PRIMARY KEY NOT NULL,
        expiresAt      TEXT NOT NULL,
        token          TEXT NOT NULL UNIQUE,
        createdAt      TEXT NOT NULL,
        updatedAt      TEXT NOT NULL,
        ipAddress      TEXT,
        userAgent      TEXT,
        userId         TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        impersonatedBy TEXT
      );
      CREATE INDEX IF NOT EXISTS session_userId_idx ON session (userId);

      -- account (one row per linked credential — github / email-otp / ...)
      CREATE TABLE IF NOT EXISTS account (
        id                       TEXT PRIMARY KEY NOT NULL,
        accountId                TEXT NOT NULL,
        providerId               TEXT NOT NULL,
        userId                   TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        accessToken              TEXT,
        refreshToken             TEXT,
        idToken                  TEXT,
        accessTokenExpiresAt     TEXT,
        refreshTokenExpiresAt    TEXT,
        scope                    TEXT,
        password                 TEXT,
        createdAt                TEXT NOT NULL,
        updatedAt                TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS account_userId_idx ON account (userId);

      -- verification (magic-link / OTP / email-verify tokens)
      CREATE TABLE IF NOT EXISTS verification (
        id         TEXT PRIMARY KEY NOT NULL,
        identifier TEXT NOT NULL,
        value      TEXT NOT NULL,
        expiresAt  TEXT NOT NULL,
        createdAt  TEXT NOT NULL,
        updatedAt  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier);

      -- MCP plugin (reuses oidc-provider schema): DCR client registry
      CREATE TABLE IF NOT EXISTS oauthApplication (
        id            TEXT PRIMARY KEY NOT NULL,
        name          TEXT NOT NULL,
        icon          TEXT,
        metadata      TEXT,
        clientId      TEXT NOT NULL UNIQUE,
        clientSecret  TEXT,
        redirectUrls  TEXT NOT NULL,
        type          TEXT NOT NULL,
        disabled      INTEGER DEFAULT 0,
        userId        TEXT REFERENCES user(id) ON DELETE CASCADE,
        createdAt     TEXT NOT NULL,
        updatedAt     TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS oauthApplication_userId_idx ON oauthApplication (userId);

      -- MCP plugin: bearer access tokens issued to MCP clients
      CREATE TABLE IF NOT EXISTS oauthAccessToken (
        id                     TEXT PRIMARY KEY NOT NULL,
        accessToken            TEXT NOT NULL UNIQUE,
        refreshToken           TEXT NOT NULL UNIQUE,
        accessTokenExpiresAt   TEXT NOT NULL,
        refreshTokenExpiresAt  TEXT NOT NULL,
        clientId               TEXT NOT NULL REFERENCES oauthApplication(clientId) ON DELETE CASCADE,
        userId                 TEXT REFERENCES user(id) ON DELETE CASCADE,
        scopes                 TEXT NOT NULL,
        createdAt              TEXT NOT NULL,
        updatedAt              TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS oauthAccessToken_clientId_idx ON oauthAccessToken (clientId);
      CREATE INDEX IF NOT EXISTS oauthAccessToken_userId_idx ON oauthAccessToken (userId);

      -- MCP plugin: per-(user, client, scopes) consent records
      CREATE TABLE IF NOT EXISTS oauthConsent (
        id           TEXT PRIMARY KEY NOT NULL,
        clientId     TEXT NOT NULL REFERENCES oauthApplication(clientId) ON DELETE CASCADE,
        userId       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        scopes       TEXT NOT NULL,
        createdAt    TEXT NOT NULL,
        updatedAt    TEXT NOT NULL,
        consentGiven INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS oauthConsent_clientId_idx ON oauthConsent (clientId);
      CREATE INDEX IF NOT EXISTS oauthConsent_userId_idx ON oauthConsent (userId);
    `,
  },
];

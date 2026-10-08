import type { Database } from './database';

/** MIGRATIONS[i] upgrades the schema from version i to i + 1. Never edit a shipped entry. */
export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE categories (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    sort_order  INTEGER NOT NULL
  );

  CREATE TABLE tasks (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
    criteria      TEXT,
    sort_order    INTEGER NOT NULL,
    start_date    TEXT NOT NULL,
    end_date      TEXT,
    archived_at   TEXT,
    reminder_time TEXT,
    template_key  TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  );

  CREATE TABLE task_rules (
    task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    effective_from TEXT NOT NULL,
    tracking_type  TEXT NOT NULL CHECK (tracking_type IN ('binary', 'count', 'duration')),
    target         REAL,
    unit           TEXT,
    schedule_type  TEXT NOT NULL CHECK (schedule_type IN ('daily', 'weekdays', 'hijri_days', 'weekly_quota')),
    schedule_days  TEXT,
    weekly_quota   INTEGER,
    PRIMARY KEY (task_id, effective_from)
  );

  CREATE TABLE entries (
    task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,
    value      REAL NOT NULL CHECK (value > 0),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (task_id, date)
  );
  CREATE INDEX entries_by_date ON entries(date);

  CREATE TABLE weekly_reviews (
    week_start TEXT PRIMARY KEY,
    note       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE monthly_notes (
    month      TEXT PRIMARY KEY,
    note       TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function schemaVersion(db: Database): number {
  return db.get<{ user_version: number }>('PRAGMA user_version')?.user_version ?? 0;
}

export function migrate(db: Database): void {
  const current = schemaVersion(db);
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database schema v${current} is newer than this app (v${SCHEMA_VERSION}).`);
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

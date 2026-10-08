import { DatabaseSync } from 'node:sqlite';

import { Database, type SqlDriver } from '../database';
import { migrate } from '../migrations';

/** An in-memory database backed by Node's built-in SQLite, for tests. */
export function openTestDatabase({ migrated = true } = {}): Database {
  const sqlite = new DatabaseSync(':memory:');
  const plain = <T,>(row: unknown): T => ({ ...(row as object) }) as T;
  const driver: SqlDriver = {
    exec: (sql) => sqlite.exec(sql),
    run: (sql, params) => {
      sqlite.prepare(sql).run(...params);
    },
    all: <T,>(sql: string, params: (string | number | null)[]) =>
      sqlite.prepare(sql).all(...params).map((r) => plain<T>(r)),
    get: <T,>(sql: string, params: (string | number | null)[]) => {
      const row = sqlite.prepare(sql).get(...params);
      return row === undefined ? null : plain<T>(row);
    },
  };
  driver.exec('PRAGMA foreign_keys = ON');
  const db = new Database(driver);
  if (migrated) migrate(db);
  return db;
}

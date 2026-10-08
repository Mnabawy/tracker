import { openDatabaseAsync } from 'expo-sqlite';

import { Database, type SqlDriver } from './database';
import { migrate } from './migrations';

export const DB_NAME = 'tracker.db';

/**
 * Opens the on-device database and brings its schema up to date. Opening is
 * async so app start-up doesn't block the JS thread; queries after that are
 * synchronous (they are small and fast).
 */
export async function openAppDatabase(name: string = DB_NAME): Promise<Database> {
  const sqlite = await openDatabaseAsync(name);
  await sqlite.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  const driver: SqlDriver = {
    exec: (sql) => sqlite.execSync(sql),
    run: (sql, params) => {
      sqlite.runSync(sql, params);
    },
    all: (sql, params) => sqlite.getAllSync(sql, params),
    get: (sql, params) => sqlite.getFirstSync(sql, params),
  };
  const db = new Database(driver);
  migrate(db);
  return db;
}

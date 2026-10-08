import { openDatabaseAsync } from 'expo-sqlite';
import { Platform } from 'react-native';

import { Database, type SqlDriver } from './database';
import { migrate } from './migrations';

export const DB_NAME = 'tracker.db';

/**
 * Opens the on-device database and brings its schema up to date.
 *
 * Opening is async so that on web the SQLite worker (WebAssembly) is fully
 * loaded before the first synchronous query; after that, queries are sync.
 */
export async function openAppDatabase(name: string = DB_NAME): Promise<Database> {
  const sqlite = await openDatabaseAsync(name);
  await sqlite.execAsync('PRAGMA foreign_keys = ON');
  if (Platform.OS !== 'web') await sqlite.execAsync('PRAGMA journal_mode = WAL');

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

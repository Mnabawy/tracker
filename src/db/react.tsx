import { createContext, type ReactNode, use, useMemo, useSyncExternalStore } from 'react';

import type { Database } from './database';
import { getSettings, type Settings } from './repo/settings';

const DbContext = createContext<Database | null>(null);

export function DbProvider({ db, children }: { db: Database; children: ReactNode }) {
  return <DbContext value={db}>{children}</DbContext>;
}

export function useDb(): Database {
  const db = use(DbContext);
  if (!db) throw new Error('useDb must be used inside <DbProvider>');
  return db;
}

type Dep = string | number | boolean | null | undefined;

/**
 * Runs a synchronous query and re-runs it whenever the database changes or
 * one of `deps` (the values the query closes over) changes. Queries are small
 * (a few hundred rows), so this stays cheap.
 */
export function useLive<T>(query: (db: Database) => T, deps: readonly Dep[]): T {
  const db = useDb();
  const version = useSyncExternalStore(db.subscribe, () => db.version);
  const depsKey = JSON.stringify(deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `query` is described by `deps`
  return useMemo(() => query(db), [db, version, depsKey]);
}

export function useSettings(): Settings {
  return useLive(getSettings, []);
}

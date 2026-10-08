export type SqlValue = string | number | null;

/** The minimal synchronous SQLite surface the app needs. */
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params: SqlValue[]): void;
  all<T>(sql: string, params: SqlValue[]): T[];
  get<T>(sql: string, params: SqlValue[]): T | null;
}

/**
 * Wraps a driver with flat (re-entrant) transactions and change
 * notifications: every committed write bumps `version` and notifies
 * subscribers, which is what live queries re-run on.
 */
export class Database {
  private depth = 0;
  private dirty = false;
  private listeners = new Set<() => void>();
  private _version = 0;

  constructor(private readonly driver: SqlDriver) {}

  get version(): number {
    return this._version;
  }

  exec(sql: string): void {
    this.driver.exec(sql);
    this.markDirty();
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.driver.run(sql, params);
    this.markDirty();
  }

  all<T>(sql: string, params: SqlValue[] = []): T[] {
    return this.driver.all<T>(sql, params);
  }

  get<T>(sql: string, params: SqlValue[] = []): T | null {
    return this.driver.get<T>(sql, params);
  }

  /** Runs `fn` atomically. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();
    this.driver.exec('BEGIN');
    this.depth++;
    try {
      const result = fn();
      this.driver.exec('COMMIT');
      return result;
    } catch (e) {
      this.driver.exec('ROLLBACK');
      this.dirty = false;
      throw e;
    } finally {
      this.depth--;
      this.flush();
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private markDirty(): void {
    this.dirty = true;
    if (this.depth === 0) this.flush();
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this._version++;
    for (const l of this.listeners) l();
  }
}

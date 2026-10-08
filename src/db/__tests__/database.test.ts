import { migrate, SCHEMA_VERSION, schemaVersion } from '../migrations';
import { openTestDatabase } from './nodeDb';

describe('Database', () => {
  it('notifies subscribers once per committed write or transaction', () => {
    const db = openTestDatabase();
    const calls: number[] = [];
    db.subscribe(() => calls.push(db.version));

    db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
    db.transaction(() => {
      db.run("INSERT INTO settings (key, value) VALUES ('b', '1')");
      db.run("INSERT INTO settings (key, value) VALUES ('c', '1')");
    });
    expect(calls).toHaveLength(2);
  });

  it('rolls back failed transactions without notifying', () => {
    const db = openTestDatabase();
    const listener = jest.fn();
    db.subscribe(listener);
    expect(() =>
      db.transaction(() => {
        db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
        db.transaction(() => {
          throw new Error('boom');
        });
      }),
    ).toThrow('boom');
    expect(db.all('SELECT * FROM settings')).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('unsubscribes', () => {
    const db = openTestDatabase();
    const listener = jest.fn();
    const off = db.subscribe(listener);
    off();
    db.run("INSERT INTO settings (key, value) VALUES ('a', '1')");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('migrations', () => {
  it('creates the schema and is idempotent', () => {
    const db = openTestDatabase({ migrated: false });
    expect(schemaVersion(db)).toBe(0);
    migrate(db);
    migrate(db);
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .map((t) => t.name);
    expect(tables).toEqual([
      'categories',
      'entries',
      'monthly_notes',
      'settings',
      'task_rules',
      'tasks',
      'weekly_reviews',
    ]);
  });

  it('refuses a database from a newer app version', () => {
    const db = openTestDatabase();
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    expect(() => migrate(db)).toThrow(/newer/);
  });
});

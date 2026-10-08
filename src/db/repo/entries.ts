import type { DateKey, EntryIndex } from '@/domain/types';

import type { Database, SqlValue } from '../database';
import { nowIso } from '../ids';
import type { EntryRow } from '../rows';

export interface EntryQuery {
  /** Inclusive. */
  from?: DateKey;
  /** Inclusive. */
  to?: DateKey;
  taskId?: string;
}

/** Logged values as taskId → (date → value). */
export function loadEntries(db: Database, q: EntryQuery = {}): EntryIndex {
  const where: string[] = [];
  const params: SqlValue[] = [];
  if (q.from) {
    where.push('date >= ?');
    params.push(q.from);
  }
  if (q.to) {
    where.push('date <= ?');
    params.push(q.to);
  }
  if (q.taskId) {
    where.push('task_id = ?');
    params.push(q.taskId);
  }
  const sql = `SELECT task_id, date, value FROM entries${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
  const index: EntryIndex = new Map();
  for (const r of db.all<Pick<EntryRow, 'task_id' | 'date' | 'value'>>(sql, params)) {
    let byDate = index.get(r.task_id);
    if (!byDate) index.set(r.task_id, (byDate = new Map()));
    byDate.set(r.date, r.value);
  }
  return index;
}

/** Records a value for a task on a day. 0 (or less) clears it. */
export function setEntry(db: Database, taskId: string, date: DateKey, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`Invalid entry value: ${value}`);
  if (value <= 0) {
    db.run('DELETE FROM entries WHERE task_id = ? AND date = ?', [taskId, date]);
    return;
  }
  db.run(
    `INSERT INTO entries (task_id, date, value, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (task_id, date) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [taskId, date, value, nowIso()],
  );
}

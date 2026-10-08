import type { DateKey, MonthKey } from '@/domain/types';

import type { Database } from '../database';
import { nowIso } from '../ids';
import type { MonthlyNoteRow, WeeklyReviewRow } from '../rows';

/** Weekly review ("ما العبادة التي تقع منك؟ ولماذا؟") for the week starting on a Saturday. */
export function getWeeklyReview(db: Database, weekStart: DateKey): string | null {
  return db.get<WeeklyReviewRow>('SELECT * FROM weekly_reviews WHERE week_start = ?', [weekStart])?.note ?? null;
}

export function setWeeklyReview(db: Database, weekStart: DateKey, note: string): void {
  upsertNote(db, 'weekly_reviews', 'week_start', weekStart, note);
}

export function listWeeklyReviews(db: Database): WeeklyReviewRow[] {
  return db.all<WeeklyReviewRow>('SELECT * FROM weekly_reviews ORDER BY week_start DESC');
}

/** Monthly note / dua. */
export function getMonthlyNote(db: Database, month: MonthKey): string | null {
  return db.get<MonthlyNoteRow>('SELECT * FROM monthly_notes WHERE month = ?', [month])?.note ?? null;
}

export function setMonthlyNote(db: Database, month: MonthKey, note: string): void {
  upsertNote(db, 'monthly_notes', 'month', month, note);
}

/** Saving an empty note removes it. */
function upsertNote(db: Database, table: string, keyColumn: string, key: string, note: string): void {
  const text = note.trim();
  if (!text) {
    db.run(`DELETE FROM ${table} WHERE ${keyColumn} = ?`, [key]);
    return;
  }
  db.run(
    `INSERT INTO ${table} (${keyColumn}, note, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (${keyColumn}) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at`,
    [key, text, nowIso()],
  );
}

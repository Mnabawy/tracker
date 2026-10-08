import { firstDayOfMonth, monthOf } from '@/domain/dates';
import { DEFAULT_TASKS } from '@/domain/templates';
import type { DateKey } from '@/domain/types';

import type { Database } from './database';
import { nowIso } from './ids';
import { createTask } from './repo/tasks';
import { getSettings, updateSettings } from './repo/settings';

/**
 * First launch: inserts the 8 default tasks. They start on the 1st of the
 * current month so days already ticked on the paper board can be filled in.
 * Runs once; afterwards the defaults are ordinary, fully editable tasks.
 */
export function seedIfNeeded(db: Database, today: DateKey): boolean {
  if (getSettings(db).seededAt !== null) return false;
  db.transaction(() => {
    const hasTasks = (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM tasks')?.n ?? 0) > 0;
    if (!hasTasks) {
      const startDate = firstDayOfMonth(monthOf(today));
      for (const t of DEFAULT_TASKS) {
        createTask(db, {
          name: t.name,
          categoryId: null,
          criteria: t.criteria,
          startDate,
          endDate: null,
          reminderTime: null,
          templateKey: t.key,
          tracking: t.tracking,
          target: t.target,
          unit: t.unit,
          schedule: t.schedule,
        });
      }
    }
    updateSettings(db, { seededAt: nowIso() });
  });
  return true;
}

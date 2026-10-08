import type { Schedule, Task, TaskRule, TrackingType, Weekday } from '@/domain/types';

import type { SqlValue } from './database';

export interface CategoryRow {
  id: string;
  name: string;
  sort_order: number;
}

export interface TaskRow {
  id: string;
  name: string;
  category_id: string | null;
  criteria: string | null;
  sort_order: number;
  start_date: string;
  end_date: string | null;
  archived_at: string | null;
  reminder_time: string | null;
  template_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface RuleRow {
  task_id: string;
  effective_from: string;
  tracking_type: TrackingType;
  target: number | null;
  unit: string | null;
  schedule_type: Schedule['type'];
  schedule_days: string | null;
  weekly_quota: number | null;
}

export interface EntryRow {
  task_id: string;
  date: string;
  value: number;
  updated_at: string;
}

export interface WeeklyReviewRow {
  week_start: string;
  note: string;
  updated_at: string;
}

export interface MonthlyNoteRow {
  month: string;
  note: string;
  updated_at: string;
}

export const TASK_COLUMNS = [
  'id',
  'name',
  'category_id',
  'criteria',
  'sort_order',
  'start_date',
  'end_date',
  'archived_at',
  'reminder_time',
  'template_key',
  'created_at',
  'updated_at',
] as const satisfies readonly (keyof TaskRow)[];

export const RULE_COLUMNS = [
  'task_id',
  'effective_from',
  'tracking_type',
  'target',
  'unit',
  'schedule_type',
  'schedule_days',
  'weekly_quota',
] as const satisfies readonly (keyof RuleRow)[];

/** INSERT statement + params for a row object, in a fixed column order. */
export function insertSql<R extends object>(
  table: string,
  columns: readonly (keyof R & string)[],
  row: R,
): [string, SqlValue[]] {
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  return [sql, columns.map((c) => (row[c] ?? null) as SqlValue)];
}

function parseDays(json: string | null): number[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? v.filter((d): d is number => typeof d === 'number') : [];
  } catch {
    return [];
  }
}

export function ruleFromRow(r: RuleRow): TaskRule {
  let schedule: Schedule;
  switch (r.schedule_type) {
    case 'weekdays':
      schedule = { type: 'weekdays', days: parseDays(r.schedule_days) as Weekday[] };
      break;
    case 'hijri_days':
      schedule = { type: 'hijri_days', days: parseDays(r.schedule_days) };
      break;
    case 'weekly_quota':
      schedule = { type: 'weekly_quota', perWeek: r.weekly_quota ?? 1 };
      break;
    default:
      schedule = { type: 'daily' };
  }
  return {
    effectiveFrom: r.effective_from,
    tracking: r.tracking_type,
    target: r.target,
    unit: r.unit,
    schedule,
  };
}

export function ruleToRow(taskId: string, rule: TaskRule): RuleRow {
  const s = rule.schedule;
  return {
    task_id: taskId,
    effective_from: rule.effectiveFrom,
    tracking_type: rule.tracking,
    target: rule.target,
    unit: rule.unit,
    schedule_type: s.type,
    schedule_days: s.type === 'weekdays' || s.type === 'hijri_days' ? JSON.stringify(s.days) : null,
    weekly_quota: s.type === 'weekly_quota' ? s.perWeek : null,
  };
}

export function taskFromRow(r: TaskRow, rules: TaskRule[]): Task {
  return {
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    criteria: r.criteria,
    sortOrder: r.sort_order,
    startDate: r.start_date,
    endDate: r.end_date,
    archivedAt: r.archived_at,
    reminderTime: r.reminder_time,
    templateKey: r.template_key,
    rules,
  };
}

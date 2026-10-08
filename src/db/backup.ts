import { isDateKey, isMonthKey, isTime } from '@/domain/dates';
import { validateRuleContent } from '@/domain/validation';

import type { Database } from './database';
import { SCHEMA_VERSION } from './migrations';
import { isValidSetting, SETTING_KEYS, type Settings } from './repo/settings';
import {
  type CategoryRow,
  type EntryRow,
  insertSql,
  type MonthlyNoteRow,
  RULE_COLUMNS,
  type RuleRow,
  ruleFromRow,
  TASK_COLUMNS,
  type TaskRow,
  type WeeklyReviewRow,
} from './rows';

export const BACKUP_APP = 'daily-tracker';

export interface BackupData {
  categories: CategoryRow[];
  tasks: TaskRow[];
  task_rules: RuleRow[];
  entries: EntryRow[];
  weekly_reviews: WeeklyReviewRow[];
  monthly_notes: MonthlyNoteRow[];
  settings: Partial<Settings>;
}

export interface BackupFile {
  app: typeof BACKUP_APP;
  schemaVersion: number;
  exportedAt: string;
  data: BackupData;
}

export type BackupErrorReason = 'not_json' | 'wrong_app' | 'newer_version' | 'invalid_data';

export class BackupError extends Error {
  constructor(
    readonly reason: BackupErrorReason,
    readonly detail?: string,
  ) {
    super(detail ? `${reason}: ${detail}` : reason);
    this.name = 'BackupError';
  }
}

// ---------------------------------------------------------------------------
// Export

export function exportBackup(db: Database, now: Date = new Date()): BackupFile {
  const settings: Partial<Settings> = {};
  for (const row of db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    const key = row.key as keyof Settings;
    if (!SETTING_KEYS.includes(key)) continue;
    try {
      const value: unknown = JSON.parse(row.value);
      if (isValidSetting(key, value)) (settings as Record<string, unknown>)[key] = value;
    } catch {
      // skip unreadable values
    }
  }
  return {
    app: BACKUP_APP,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: {
      categories: db.all<CategoryRow>('SELECT * FROM categories ORDER BY sort_order'),
      tasks: db.all<TaskRow>('SELECT * FROM tasks ORDER BY sort_order'),
      task_rules: db.all<RuleRow>('SELECT * FROM task_rules ORDER BY task_id, effective_from'),
      entries: db.all<EntryRow>('SELECT * FROM entries ORDER BY date, task_id'),
      weekly_reviews: db.all<WeeklyReviewRow>('SELECT * FROM weekly_reviews ORDER BY week_start'),
      monthly_notes: db.all<MonthlyNoteRow>('SELECT * FROM monthly_notes ORDER BY month'),
      settings,
    },
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

// ---------------------------------------------------------------------------
// Parse + validate

type Check = (v: unknown) => boolean;

const str: Check = (v) => typeof v === 'string';
const nonEmpty: Check = (v) => typeof v === 'string' && v.trim().length > 0;
const int: Check = (v) => typeof v === 'number' && Number.isInteger(v);
const positive: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const dateKey: Check = isDateKey;
const orNull =
  (c: Check): Check =>
  (v) =>
    v === null || v === undefined || c(v);
const oneOf =
  (...values: unknown[]): Check =>
  (v) =>
    values.includes(v);
const daysJson: Check = (v) => {
  if (typeof v !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(v);
    return Array.isArray(parsed) && parsed.every((d) => Number.isInteger(d));
  } catch {
    return false;
  }
};

const SHAPES = {
  categories: { id: nonEmpty, name: nonEmpty, sort_order: int },
  tasks: {
    id: nonEmpty,
    name: nonEmpty,
    category_id: orNull(str),
    criteria: orNull(str),
    sort_order: int,
    start_date: dateKey,
    end_date: orNull(dateKey),
    archived_at: orNull(dateKey),
    reminder_time: orNull(isTime),
    template_key: orNull(str),
    created_at: str,
    updated_at: str,
  },
  task_rules: {
    task_id: nonEmpty,
    effective_from: dateKey,
    tracking_type: oneOf('binary', 'count', 'duration'),
    target: orNull(positive),
    unit: orNull(str),
    schedule_type: oneOf('daily', 'weekdays', 'hijri_days', 'weekly_quota'),
    schedule_days: orNull(daysJson),
    weekly_quota: orNull(int),
  },
  entries: { task_id: nonEmpty, date: dateKey, value: positive, updated_at: str },
  weekly_reviews: { week_start: dateKey, note: str, updated_at: str },
  monthly_notes: { month: isMonthKey, note: str, updated_at: str },
} satisfies Record<Exclude<keyof BackupData, 'settings'>, Record<string, Check>>;

function checkRows<R>(table: keyof typeof SHAPES, rows: unknown): R[] {
  if (!Array.isArray(rows)) throw new BackupError('invalid_data', `${table} is not a list`);
  const shape: Record<string, Check> = SHAPES[table];
  return rows.map((row: unknown, i) => {
    if (typeof row !== 'object' || row === null) throw new BackupError('invalid_data', `${table}[${i}]`);
    const out: Record<string, unknown> = {};
    for (const [col, check] of Object.entries(shape)) {
      const v = (row as Record<string, unknown>)[col];
      if (!check(v)) throw new BackupError('invalid_data', `${table}[${i}].${col}`);
      out[col] = v ?? null;
    }
    return out as R;
  });
}

function unique<T>(table: string, rows: T[], key: (r: T) => string): void {
  const seen = new Set<string>();
  for (const r of rows) {
    const k = key(r);
    if (seen.has(k)) throw new BackupError('invalid_data', `${table}: duplicate ${k}`);
    seen.add(k);
  }
}

/** Parses and fully validates a backup file's text. Throws BackupError. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('not_json');
  }
  if (typeof raw !== 'object' || raw === null || (raw as BackupFile).app !== BACKUP_APP) {
    throw new BackupError('wrong_app');
  }
  const file = raw as Record<string, unknown>;
  if (!int(file.schemaVersion)) throw new BackupError('invalid_data', 'schemaVersion');
  if ((file.schemaVersion as number) > SCHEMA_VERSION) throw new BackupError('newer_version');
  const data = file.data as Record<string, unknown> | undefined;
  if (typeof data !== 'object' || data === null) throw new BackupError('invalid_data', 'data');

  const categories = checkRows<CategoryRow>('categories', data.categories ?? []);
  const tasks = checkRows<TaskRow>('tasks', data.tasks ?? []);
  const rules = checkRows<RuleRow>('task_rules', data.task_rules ?? []);
  const entries = checkRows<EntryRow>('entries', data.entries ?? []);
  const reviews = checkRows<WeeklyReviewRow>('weekly_reviews', data.weekly_reviews ?? []);
  const notes = checkRows<MonthlyNoteRow>('monthly_notes', data.monthly_notes ?? []);

  unique('categories', categories, (c) => c.id);
  unique('categories', categories, (c) => c.name);
  unique('tasks', tasks, (t) => t.id);
  unique('task_rules', rules, (r) => `${r.task_id}/${r.effective_from}`);
  unique('entries', entries, (e) => `${e.task_id}/${e.date}`);
  unique('weekly_reviews', reviews, (r) => r.week_start);
  unique('monthly_notes', notes, (n) => n.month);

  const categoryIds = new Set(categories.map((c) => c.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    if (t.category_id !== null && !categoryIds.has(t.category_id)) {
      throw new BackupError('invalid_data', `tasks ${t.id}: unknown category`);
    }
    if (t.end_date !== null && t.end_date < t.start_date) {
      throw new BackupError('invalid_data', `tasks ${t.id}: end before start`);
    }
  }
  const tasksWithRules = new Set<string>();
  for (const r of rules) {
    if (!taskIds.has(r.task_id)) throw new BackupError('invalid_data', `task_rules: unknown task ${r.task_id}`);
    if (validateRuleContent(ruleFromRow(r)).length > 0) {
      throw new BackupError('invalid_data', `task_rules ${r.task_id}/${r.effective_from}`);
    }
    tasksWithRules.add(r.task_id);
  }
  for (const t of tasks) {
    if (!tasksWithRules.has(t.id)) throw new BackupError('invalid_data', `tasks ${t.id}: no rules`);
  }
  for (const e of entries) {
    if (!taskIds.has(e.task_id)) throw new BackupError('invalid_data', `entries: unknown task ${e.task_id}`);
  }

  // Settings are non-critical: keep the valid ones, drop the rest.
  const settings: Partial<Settings> = {};
  const rawSettings = data.settings;
  if (typeof rawSettings === 'object' && rawSettings !== null) {
    for (const key of SETTING_KEYS) {
      const v = (rawSettings as Record<string, unknown>)[key];
      if (v !== undefined && isValidSetting(key, v)) (settings as Record<string, unknown>)[key] = v;
    }
  }

  return {
    app: BACKUP_APP,
    schemaVersion: file.schemaVersion as number,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    data: {
      categories,
      tasks,
      task_rules: rules,
      entries,
      weekly_reviews: reviews,
      monthly_notes: notes,
      settings,
    },
  };
}

// ---------------------------------------------------------------------------
// Import / wipe

const DATA_TABLES = [
  'entries',
  'task_rules',
  'tasks',
  'categories',
  'weekly_reviews',
  'monthly_notes',
  'settings',
] as const;

/** Deletes every row (schema stays). */
export function wipeAllData(db: Database): void {
  db.transaction(() => {
    for (const table of DATA_TABLES) db.run(`DELETE FROM ${table}`);
  });
}

/** Replaces all data with a parsed backup, atomically. */
export function importBackup(db: Database, backup: BackupFile): void {
  const d = backup.data;
  db.transaction(() => {
    wipeAllData(db);
    for (const c of d.categories) db.run(...insertSql('categories', ['id', 'name', 'sort_order'], c));
    for (const t of d.tasks) db.run(...insertSql('tasks', TASK_COLUMNS, t));
    for (const r of d.task_rules) db.run(...insertSql('task_rules', RULE_COLUMNS, r));
    for (const e of d.entries) db.run(...insertSql('entries', ['task_id', 'date', 'value', 'updated_at'], e));
    for (const r of d.weekly_reviews) {
      db.run(...insertSql('weekly_reviews', ['week_start', 'note', 'updated_at'], r));
    }
    for (const n of d.monthly_notes) db.run(...insertSql('monthly_notes', ['month', 'note', 'updated_at'], n));
    for (const [key, value] of Object.entries(d.settings)) {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    }
  });
}

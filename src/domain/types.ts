/** A local calendar day, 'YYYY-MM-DD'. Never a UTC timestamp. */
export type DateKey = string;

/** A calendar month, 'YYYY-MM'. */
export type MonthKey = string;

/** 0 = Sunday … 6 = Saturday (same as Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TrackingType = 'binary' | 'count' | 'duration';

export type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: Weekday[] }
  | { type: 'hijri_days'; days: number[] }
  | { type: 'weekly_quota'; perWeek: number };

export type ScheduleType = Schedule['type'];

/** The part of a task that is versioned by date. */
export interface TaskRule {
  effectiveFrom: DateKey;
  tracking: TrackingType;
  /** Count or minutes; null for binary tasks. */
  target: number | null;
  /** Optional label for count tasks, e.g. 'صفحة'. */
  unit: string | null;
  schedule: Schedule;
}

export interface Task {
  id: string;
  name: string;
  categoryId: string | null;
  /** What counts as "done". */
  criteria: string | null;
  sortOrder: number;
  startDate: DateKey;
  /** Inclusive. */
  endDate: DateKey | null;
  /** Not scheduled on or after this day. */
  archivedAt: DateKey | null;
  /** 'HH:MM' */
  reminderTime: string | null;
  templateKey: string | null;
  /** Sorted by effectiveFrom ascending; never empty. */
  rules: TaskRule[];
}

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
}

export type Status = 'none' | 'partial' | 'done';

/** Logged values per task per day: taskId → (date → value). Missing = nothing logged. */
export type EntryIndex = Map<string, Map<DateKey, number>>;

export interface HijriDate {
  year: number;
  /** 1 … 12 */
  month: number;
  /** 1 … 30 */
  day: number;
}

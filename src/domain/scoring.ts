import { eachDay, weekEndOf, weekStartOf } from './dates';
import { isActive, isDailySlot, isWeeklyQuotaOn, ruleAt, type ScheduleContext } from './schedule';
import type { DateKey, EntryIndex, Status, Task, TaskRule } from './types';

export interface Tally {
  earned: number;
  possible: number;
}

export const emptyTally = (): Tally => ({ earned: 0, possible: 0 });

/** earned / possible in 0…1, or null when nothing was possible. */
export function rate(t: Tally): number | null {
  return t.possible > 0 ? t.earned / t.possible : null;
}

export function valueOf(entries: EntryIndex, taskId: string, key: DateKey): number {
  return entries.get(taskId)?.get(key) ?? 0;
}

/** How much of one day's slot a logged value fills, 0…1. */
export function ratioOf(rule: Pick<TaskRule, 'tracking' | 'target'>, value: number): number {
  if (!(value > 0)) return 0;
  if (rule.tracking === 'binary') return Math.min(value, 1);
  const target = rule.target ?? 0;
  return target > 0 ? Math.min(value / target, 1) : 1;
}

export function statusOf(rule: Pick<TaskRule, 'tracking' | 'target'>, value: number): Status {
  const r = ratioOf(rule, value);
  return r >= 1 ? 'done' : r > 0 ? 'partial' : 'none';
}

/** Binary tap cycle: not done → ½ → done → not done. */
export function nextBinaryValue(value: number): number {
  if (value <= 0) return 0.5;
  if (value < 1) return 1;
  return 0;
}

/** Makes a value valid for the rule's tracking type. */
export function sanitizeValue(rule: Pick<TaskRule, 'tracking'>, value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (rule.tracking === 'binary') return value >= 1 ? 1 : 0.5;
  return Math.round(value);
}

/** Score for one day: daily-type tasks scheduled that day (weekly-quota tasks excluded). */
export function dayScore(
  tasks: Task[],
  entries: EntryIndex,
  key: DateKey,
  ctx: ScheduleContext,
): Tally {
  const t = emptyTally();
  for (const task of tasks) {
    if (!isDailySlot(task, key, ctx)) continue;
    t.possible += 1;
    t.earned += ratioOf(ruleAt(task, key), valueOf(entries, task.id, key));
  }
  return t;
}

export interface WeekSlot extends Tally {
  weekStart: DateKey;
  weekEnd: DateKey;
  /** Weekly target X for this week. */
  quota: number;
  /** Raw sum of day ratios this week (can exceed quota). */
  logged: number;
}

/**
 * The weekly-quota slot of a task for the Sat→Fri week containing `key`, or
 * null if the task has no weekly-quota days that week. `possible` is the quota,
 * reduced when the task is only active on fewer days that week (it started,
 * ended or was archived mid-week).
 */
export function weekSlot(task: Task, entries: EntryIndex, key: DateKey): WeekSlot | null {
  const weekStart = weekStartOf(key);
  const weekEnd = weekEndOf(key);
  let quota = 0;
  let available = 0;
  let logged = 0;
  for (const d of eachDay(weekStart, weekEnd)) {
    if (!isActive(task, d) || !isWeeklyQuotaOn(task, d)) continue;
    const rule = ruleAt(task, d);
    if (rule.schedule.type === 'weekly_quota') quota = rule.schedule.perWeek; // latest rule in the week wins
    available += 1;
    logged += ratioOf(rule, valueOf(entries, task.id, d));
  }
  if (available === 0) return null;
  const possible = Math.min(quota, available);
  return { weekStart, weekEnd, quota, logged, possible, earned: Math.min(logged, possible) };
}

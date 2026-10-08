import { addDays, minKey, weekdayOf } from './dates';
import { hijriDayLookup } from './hijri';
import type { DateKey, Schedule, Task, TaskRule } from './types';

export interface ScheduleContext {
  /** Hijri day-of-month (after the user's offset), or null if out of range. */
  hijriDay: (key: DateKey) => number | null;
}

export function makeScheduleContext(hijriOffset: number): ScheduleContext {
  return { hijriDay: hijriDayLookup(hijriOffset) };
}

/** The rule in force on a day: the latest rule with effectiveFrom <= key. */
export function ruleAt(task: Task, key: DateKey): TaskRule {
  const rules = task.rules;
  let found = rules[0];
  if (!found) throw new Error(`Task ${task.id} has no rules`);
  for (const r of rules) {
    if (r.effectiveFrom <= key) found = r;
    else break;
  }
  return found;
}

/** The last day the task can be scheduled, or null if open-ended. */
export function lastActiveDay(task: Task): DateKey | null {
  const beforeArchive = task.archivedAt ? addDays(task.archivedAt, -1) : null;
  if (task.endDate && beforeArchive) return minKey(task.endDate, beforeArchive);
  return task.endDate ?? beforeArchive;
}

/** Within start/end dates and not archived on that day. */
export function isActive(task: Task, key: DateKey): boolean {
  if (key < task.startDate) return false;
  if (task.endDate && key > task.endDate) return false;
  if (task.archivedAt && key >= task.archivedAt) return false;
  return true;
}

export function scheduleMatches(schedule: Schedule, key: DateKey, ctx: ScheduleContext): boolean {
  switch (schedule.type) {
    case 'daily':
    case 'weekly_quota':
      return true;
    case 'weekdays':
      return schedule.days.includes(weekdayOf(key));
    case 'hijri_days': {
      const d = ctx.hijriDay(key);
      return d !== null && schedule.days.includes(d);
    }
  }
}

/**
 * Whether the task shows up (is not greyed out) on a day. For weekly-quota
 * tasks every active day is available; their target is counted per week.
 */
export function isScheduled(task: Task, key: DateKey, ctx: ScheduleContext): boolean {
  return isActive(task, key) && scheduleMatches(ruleAt(task, key).schedule, key, ctx);
}

export function isWeeklyQuotaOn(task: Task, key: DateKey): boolean {
  return ruleAt(task, key).schedule.type === 'weekly_quota';
}

/** Scheduled and counted per day (i.e. not a weekly-quota day). */
export function isDailySlot(task: Task, key: DateKey, ctx: ScheduleContext): boolean {
  return isScheduled(task, key, ctx) && !isWeeklyQuotaOn(task, key);
}

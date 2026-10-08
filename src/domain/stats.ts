import { addDays, daysOfMonth, maxKey, minKey, weekStartOf, weeksOfMonth } from './dates';
import { isDailySlot, isWeeklyQuotaOn, lastActiveDay, ruleAt, type ScheduleContext } from './schedule';
import { dayScore, rate, ratioOf, type Tally, valueOf, weekSlot } from './scoring';
import type { DateKey, EntryIndex, MonthKey, Task } from './types';

// A slot is one scheduled day (daily-type tasks) or one Sat→Fri week
// (weekly-quota tasks). `earned / possible` only count slots that are closed —
// already over, or already fully done — so an unfinished today or current
// week never drags a percentage down. `logged / planned` count every slot in
// the month, which is what the paper-style board totals show.

export interface TaskMonthStats extends Tally {
  taskId: string;
  /** Σ ratio over all slots in the month, including open ones. */
  logged: number;
  /** All slots in the month, including future ones. */
  planned: number;
}

export function taskMonthStats(
  task: Task,
  month: MonthKey,
  entries: EntryIndex,
  ctx: ScheduleContext,
  today: DateKey,
): TaskMonthStats {
  const s: TaskMonthStats = { taskId: task.id, earned: 0, possible: 0, logged: 0, planned: 0 };

  for (const d of daysOfMonth(month)) {
    if (!isDailySlot(task, d, ctx)) continue;
    const ratio = ratioOf(ruleAt(task, d), valueOf(entries, task.id, d));
    s.planned += 1;
    s.logged += ratio;
    if (d < today || ratio >= 1) {
      s.possible += 1;
      s.earned += ratio;
    }
  }

  for (const ws of weeksOfMonth(month)) {
    const w = weekSlot(task, entries, ws);
    if (!w || w.possible <= 0) continue;
    s.planned += w.possible;
    s.logged += w.earned;
    if (w.weekEnd < today || w.earned >= w.possible) {
      s.possible += w.possible;
      s.earned += w.earned;
    }
  }
  return s;
}

export interface DayResult extends Tally {
  date: DateKey;
}

export interface MonthStats {
  month: MonthKey;
  /** Tasks with at least one slot this month, in the given task order. */
  tasks: TaskMonthStats[];
  total: TaskMonthStatsTotal;
  /** Daily score for every day of the month. */
  days: DayResult[];
  bestDay: DayResult | null;
  weakestTaskId: string | null;
}

export type TaskMonthStatsTotal = Omit<TaskMonthStats, 'taskId'>;

/** Minimum closed slots before a task can be called "weakest". */
export const WEAKEST_MIN_SLOTS = 3;

export function monthStats(
  tasks: Task[],
  month: MonthKey,
  entries: EntryIndex,
  ctx: ScheduleContext,
  today: DateKey,
): MonthStats {
  const rows = tasks
    .map((t) => taskMonthStats(t, month, entries, ctx, today))
    .filter((r) => r.planned > 0);

  const total = { earned: 0, possible: 0, logged: 0, planned: 0 };
  for (const r of rows) {
    total.earned += r.earned;
    total.possible += r.possible;
    total.logged += r.logged;
    total.planned += r.planned;
  }

  const days = daysOfMonth(month).map((date) => ({ date, ...dayScore(tasks, entries, date, ctx) }));

  let bestDay: DayResult | null = null;
  for (const d of days) {
    if (d.date > today || d.possible === 0) continue;
    if (!bestDay) {
      bestDay = d;
      continue;
    }
    const a = rate(d)!;
    const b = rate(bestDay)!;
    // Ties go to the day with more done, then to the later day.
    if (a > b || (a === b && d.earned >= bestDay.earned)) bestDay = d;
  }
  if (bestDay && bestDay.earned === 0) bestDay = null;

  let weakest: TaskMonthStats | null = null;
  for (const r of rows) {
    if (r.possible < WEAKEST_MIN_SLOTS) continue;
    const rr = rate(r)!;
    if (rr >= 1) continue;
    if (!weakest) {
      weakest = r;
      continue;
    }
    const w = rate(weakest)!;
    if (rr < w || (rr === w && r.possible > weakest.possible)) weakest = r;
  }

  return { month, tasks: rows, total, days, bestDay, weakestTaskId: weakest?.taskId ?? null };
}

// ---------------------------------------------------------------------------
// Streaks

export interface Streak {
  unit: 'day' | 'week';
  current: number;
  best: number;
}

/**
 * Daily-type tasks: consecutive scheduled days fully done (unscheduled days are
 * skipped, so Monday → Thursday fasting is consecutive; ½ breaks a streak).
 * Weekly-quota tasks: consecutive weeks with the quota met.
 * An unfinished today / current week never breaks the current streak.
 */
export function streakOf(
  task: Task,
  entries: EntryIndex,
  ctx: ScheduleContext,
  today: DateKey,
): Streak {
  const last = lastActiveDay(task);
  const end = last ? minKey(today, last) : today;
  const unit = isWeeklyQuotaOn(task, maxKey(end, task.startDate)) ? 'week' : 'day';
  if (end < task.startDate) return { unit, current: 0, best: 0 };

  const outcomes: boolean[] = [];
  if (unit === 'day') {
    for (let d = task.startDate; d <= end; d = addDays(d, 1)) {
      if (!isDailySlot(task, d, ctx)) continue;
      const done = ratioOf(ruleAt(task, d), valueOf(entries, task.id, d)) >= 1;
      if (!done && d >= today) continue; // still open
      outcomes.push(done);
    }
  } else {
    for (let ws = weekStartOf(task.startDate); ws <= end; ws = addDays(ws, 7)) {
      const w = weekSlot(task, entries, ws);
      if (!w || w.possible <= 0) continue;
      const met = w.earned >= w.possible;
      if (!met && w.weekEnd >= today) continue; // still open
      outcomes.push(met);
    }
  }

  let best = 0;
  let run = 0;
  for (const ok of outcomes) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { unit, current: run, best };
}

// ---------------------------------------------------------------------------
// Multi-month comparison

export interface MonthComparison {
  months: MonthKey[];
  /** One row per task that has slots in at least one of the months. */
  rows: { taskId: string; perMonth: (TaskMonthStats | null)[] }[];
  totals: TaskMonthStatsTotal[];
}

export function compareMonths(
  tasks: Task[],
  months: MonthKey[],
  entries: EntryIndex,
  ctx: ScheduleContext,
  today: DateKey,
): MonthComparison {
  const stats = months.map((m) => monthStats(tasks, m, entries, ctx, today));
  const rows = tasks
    .map((t) => ({
      taskId: t.id,
      perMonth: stats.map((s) => s.tasks.find((r) => r.taskId === t.id) ?? null),
    }))
    .filter((r) => r.perMonth.some((x) => x !== null));
  return { months, rows, totals: stats.map((s) => s.total) };
}

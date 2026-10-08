import { daysOfMonth, eachDay } from '../dates';
import { rate } from '../scoring';
import { compareMonths, monthStats, streakOf, taskMonthStats } from '../stats';
import { ctx, entries, fill, task } from './helpers';

const NOV = '2026-11-10'; // "today" after October is over

describe('taskMonthStats', () => {
  it('denominator is scheduled days, not calendar days', () => {
    const t = task({ id: 'f', schedule: { type: 'weekdays', days: [1, 4] } });
    const e = entries({ f: { ...fill(['2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12']), '2026-10-15': 0.5 } });
    expect(taskMonthStats(t, '2026-10', e, ctx, NOV)).toEqual({
      taskId: 'f',
      earned: 4.5,
      possible: 9,
      logged: 4.5,
      planned: 9,
    });
  });

  it('an unfinished today does not count against the month', () => {
    const t = task({ id: 'a' });
    const week = eachDay('2026-10-01', '2026-10-07');
    const partialToday = entries({ a: { ...fill(week), '2026-10-08': 0.5 } });
    expect(taskMonthStats(t, '2026-10', partialToday, ctx, '2026-10-08')).toEqual({
      taskId: 'a',
      earned: 7,
      possible: 7,
      logged: 7.5,
      planned: 31,
    });
    const doneToday = entries({ a: fill([...week, '2026-10-08']) });
    expect(taskMonthStats(t, '2026-10', doneToday, ctx, '2026-10-08')).toMatchObject({
      earned: 8,
      possible: 8,
    });
  });

  it('weekly quota: weeks belong to the month of their Friday', () => {
    const t = task({ id: 'w', schedule: { type: 'weekly_quota', perWeek: 3 } });
    const e = entries({
      w: fill(['2026-09-27', '2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']),
    });
    // 5 weeks × 3; week 1 (Sep 26–Oct 2) = 2, week 2 = 3 (capped from 4)
    expect(taskMonthStats(t, '2026-10', e, ctx, NOV)).toMatchObject({
      earned: 5,
      possible: 15,
      planned: 15,
    });
    // On Thu Oct 8: week 1 closed (2/3), week 2 already met (3/3), later weeks open
    expect(taskMonthStats(t, '2026-10', e, ctx, '2026-10-08')).toMatchObject({
      earned: 5,
      possible: 6,
    });
  });

  it('judges past days with the rule that was in force then', () => {
    const t = task({
      id: 'q',
      startDate: '2026-10-01',
      rules: [
        { tracking: 'count', target: 5 },
        { effectiveFrom: '2026-10-15', tracking: 'count', target: 10 },
      ],
    });
    const e = entries({ q: { '2026-10-10': 5, '2026-10-20': 5 } });
    expect(taskMonthStats(t, '2026-10', e, ctx, NOV).earned).toBe(1.5);
  });

  it('archived tasks stop counting from the archive date', () => {
    const t = task({ id: 'x', archivedAt: '2026-10-10' });
    expect(taskMonthStats(t, '2026-10', entries({}), ctx, NOV).planned).toBe(9);
    expect(taskMonthStats(t, '2026-11', entries({}), ctx, NOV).planned).toBe(0);
  });
});

describe('monthStats', () => {
  const a = task({ id: 'a' });
  const b = task({ id: 'b' });
  const late = task({ id: 'late', startDate: '2026-10-30' });
  const oct = daysOfMonth('2026-10');

  it('totals active tasks and finds best day and weakest task', () => {
    const e = entries({
      a: fill(oct),
      b: fill(['2026-10-03', '2026-10-05', '2026-10-06', '2026-10-07']),
    });
    const s = monthStats([a, b, late], '2026-10', e, ctx, NOV);

    expect(s.tasks.map((r) => r.taskId)).toEqual(['a', 'b', 'late']);
    expect(s.total).toEqual({ earned: 35, possible: 64, logged: 35, planned: 64 });
    expect(s.bestDay?.date).toBe('2026-10-07'); // 2/2 — ties go to the later day
    expect(s.weakestTaskId).toBe('b'); // 'late' has only 2 slots — too few to judge
    expect(s.days).toHaveLength(31);
    expect(s.days[0]).toEqual({ date: '2026-10-01', earned: 1, possible: 2 });
  });

  it('excludes tasks with no slots and ignores future days for best day', () => {
    const future = task({ id: 'future', startDate: '2026-12-01' });
    const s = monthStats([a, future], '2026-10', entries({ a: { '2026-10-20': 1 } }), ctx, '2026-10-08');
    expect(s.tasks.map((r) => r.taskId)).toEqual(['a']);
    expect(s.bestDay).toBeNull(); // nothing done up to today
  });

  it('has no weakest task when everything is complete', () => {
    const s = monthStats([a], '2026-10', entries({ a: fill(oct) }), ctx, NOV);
    expect(s.weakestTaskId).toBeNull();
    expect(rate(s.total)).toBe(1);
  });
});

describe('streakOf', () => {
  const monThu = task({ id: 'f', startDate: '2026-10-01', schedule: { type: 'weekdays', days: [1, 4] } });

  it('skips unscheduled days', () => {
    const e = entries({ f: fill(['2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12']) });
    expect(streakOf(monThu, e, ctx, '2026-10-13')).toEqual({ unit: 'day', current: 4, best: 4 });
  });

  it('a miss resets the current streak but keeps the best', () => {
    const e = entries({
      f: fill(['2026-10-01', '2026-10-05', '2026-10-08', '2026-10-12', '2026-10-19', '2026-10-22']),
    });
    expect(streakOf(monThu, e, ctx, '2026-10-23')).toEqual({ unit: 'day', current: 2, best: 4 });
  });

  it('½ breaks a streak', () => {
    const e = entries({ f: { '2026-10-01': 1, '2026-10-05': 0.5, '2026-10-08': 1 } });
    expect(streakOf(monThu, e, ctx, '2026-10-09')).toEqual({ unit: 'day', current: 1, best: 1 });
  });

  it('an unfinished today does not break the current streak', () => {
    const daily = task({ id: 'd', startDate: '2026-10-01' });
    const week = fill(eachDay('2026-10-01', '2026-10-07'));
    expect(streakOf(daily, entries({ d: week }), ctx, '2026-10-08').current).toBe(7);
    expect(streakOf(daily, entries({ d: { ...week, '2026-10-08': 0.5 } }), ctx, '2026-10-08').current).toBe(7);
    expect(streakOf(daily, entries({ d: { ...week, '2026-10-08': 1 } }), ctx, '2026-10-08').current).toBe(8);
    expect(streakOf(daily, entries({ d: week }), ctx, '2026-10-09').current).toBe(0);
  });

  it('weekly-quota tasks count weeks', () => {
    const w = task({ id: 'w', startDate: '2026-09-26', schedule: { type: 'weekly_quota', perWeek: 1 } });
    // weeks: Sep26 ✓, Oct3 ✓, Oct10 ✗, Oct17 already met (today Oct 20)
    const e = entries({ w: fill(['2026-09-30', '2026-10-03', '2026-10-18']) });
    expect(streakOf(w, e, ctx, '2026-10-20')).toEqual({ unit: 'week', current: 1, best: 2 });
    // weeks: Sep26 ✓, Oct3 ✓, Oct10 ✓, Oct17 still open
    const e2 = entries({ w: fill(['2026-09-30', '2026-10-03', '2026-10-10']) });
    expect(streakOf(w, e2, ctx, '2026-10-20')).toEqual({ unit: 'week', current: 3, best: 3 });
  });

  it('is zero before the task starts', () => {
    const t = task({ id: 'n', startDate: '2026-12-01' });
    expect(streakOf(t, entries({}), ctx, '2026-10-08')).toEqual({ unit: 'day', current: 0, best: 0 });
  });
});

describe('compareMonths', () => {
  it('lines up tasks across months', () => {
    const old = task({ id: 'old', startDate: '2026-08-01', archivedAt: '2026-09-01' });
    const now = task({ id: 'now', startDate: '2026-10-01' });
    const c = compareMonths([old, now], ['2026-08', '2026-09', '2026-10'], entries({}), ctx, NOV);
    expect(c.rows.map((r) => [r.taskId, r.perMonth.map((m) => m?.planned ?? null)])).toEqual([
      ['old', [31, null, null]],
      ['now', [null, null, 31]],
    ]);
    expect(c.totals.map((t) => t.planned)).toEqual([31, 0, 31]);
  });
});

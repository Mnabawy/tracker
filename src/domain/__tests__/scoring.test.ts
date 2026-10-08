import {
  dayScore,
  nextBinaryValue,
  ratioOf,
  sanitizeValue,
  statusOf,
  weekSlot,
} from '../scoring';
import { ctx, entries, task } from './helpers';

const binary = { tracking: 'binary', target: null } as const;
const count10 = { tracking: 'count', target: 10 } as const;
const minutes30 = { tracking: 'duration', target: 30 } as const;

describe('cell ratio and status', () => {
  it('binary: none / ½ / done', () => {
    expect(ratioOf(binary, 0)).toBe(0);
    expect(ratioOf(binary, 0.5)).toBe(0.5);
    expect(ratioOf(binary, 1)).toBe(1);
    expect(statusOf(binary, 0.5)).toBe('partial');
    expect(statusOf(binary, 1)).toBe('done');
    expect(statusOf(binary, 0)).toBe('none');
  });

  it('count and duration are capped at the target', () => {
    expect(ratioOf(count10, 4)).toBeCloseTo(0.4);
    expect(ratioOf(count10, 25)).toBe(1);
    expect(statusOf(count10, 9)).toBe('partial');
    expect(statusOf(count10, 10)).toBe('done');
    expect(ratioOf(minutes30, 15)).toBe(0.5);
  });

  it('cycles binary taps none → ½ → done → none', () => {
    expect(nextBinaryValue(0)).toBe(0.5);
    expect(nextBinaryValue(0.5)).toBe(1);
    expect(nextBinaryValue(1)).toBe(0);
  });

  it('sanitizes values', () => {
    expect(sanitizeValue(binary, 0.3)).toBe(0.5);
    expect(sanitizeValue(binary, 3)).toBe(1);
    expect(sanitizeValue(count10, -2)).toBe(0);
    expect(sanitizeValue(count10, 3.6)).toBe(4);
    expect(sanitizeValue(count10, Number.NaN)).toBe(0);
  });
});

describe('dayScore', () => {
  it('counts only daily-type tasks scheduled that day', () => {
    const daily = task({ id: 'a' });
    const monThu = task({ id: 'b', schedule: { type: 'weekdays', days: [1, 4] } });
    const weekly = task({ id: 'c', schedule: { type: 'weekly_quota', perWeek: 3 } });
    const pagesTask = task({ id: 'd', rules: [{ tracking: 'count', target: 10 }] });
    const e = entries({ a: { '2026-10-08': 0.5 }, b: { '2026-10-08': 1 }, c: { '2026-10-08': 1 }, d: { '2026-10-08': 5 } });

    // Thursday: a, b, d scheduled; c is weekly (excluded)
    expect(dayScore([daily, monThu, weekly, pagesTask], e, '2026-10-08', ctx)).toEqual({
      earned: 0.5 + 1 + 0.5,
      possible: 3,
    });
    // Friday: b not scheduled
    expect(dayScore([daily, monThu, weekly, pagesTask], e, '2026-10-09', ctx).possible).toBe(2);
  });
});

describe('weekSlot', () => {
  const weekly = task({ id: 'w', schedule: { type: 'weekly_quota', perWeek: 3 } });

  it('caps the week at the quota', () => {
    const e = entries({ w: { '2026-10-03': 1, '2026-10-05': 1, '2026-10-06': 0.5, '2026-10-07': 1, '2026-10-08': 1 } });
    expect(weekSlot(weekly, e, '2026-10-08')).toMatchObject({
      weekStart: '2026-10-03',
      weekEnd: '2026-10-09',
      quota: 3,
      logged: 4.5,
      possible: 3,
      earned: 3,
    });
  });

  it('reduces the target when the task is active on fewer days than the quota', () => {
    const late = task({ id: 'w', startDate: '2026-10-08', schedule: { type: 'weekly_quota', perWeek: 3 } });
    expect(weekSlot(late, entries({}), '2026-10-08')?.possible).toBe(2); // Thu + Fri only
  });

  it('is null for weeks without weekly-quota days', () => {
    expect(weekSlot(task(), entries({}), '2026-10-08')).toBeNull();
  });
});

import { daysOfMonth } from '../dates';
import { toHijri } from '../hijri';
import { isActive, isScheduled, lastActiveDay, ruleAt } from '../schedule';
import { ctx, task } from './helpers';

const scheduledIn = (t: ReturnType<typeof task>, month: string) =>
  daysOfMonth(month).filter((d) => isScheduled(t, d, ctx));

describe('schedule', () => {
  it('daily tasks are scheduled every active day', () => {
    expect(scheduledIn(task(), '2026-10')).toHaveLength(31);
  });

  it('weekday tasks: Monday/Thursday fasting in Oct 2026 = 9 days', () => {
    const t = task({ schedule: { type: 'weekdays', days: [1, 4] } });
    expect(scheduledIn(t, '2026-10')).toEqual([
      '2026-10-01',
      '2026-10-05',
      '2026-10-08',
      '2026-10-12',
      '2026-10-15',
      '2026-10-19',
      '2026-10-22',
      '2026-10-26',
      '2026-10-29',
    ]);
  });

  it('hijri-day tasks follow the Hijri calendar', () => {
    const t = task({ schedule: { type: 'hijri_days', days: [13, 14, 15] } });
    const days = scheduledIn(t, '2026-10');
    expect(days).toHaveLength(3);
    expect(days.map((d) => toHijri(d)?.day)).toEqual([13, 14, 15]);
  });

  it('a 30th Hijri day is skipped in 29-day months', () => {
    const t = task({ schedule: { type: 'hijri_days', days: [30] } });
    const days = daysOfMonth('2026-01')
      .concat(daysOfMonth('2026-02'), daysOfMonth('2026-03'), daysOfMonth('2026-04'))
      .filter((d) => isScheduled(t, d, ctx));
    expect(days.every((d) => toHijri(d)?.day === 30)).toBe(true);
    expect(days.length).toBeLessThan(4);
  });

  it('respects start, end (inclusive) and archive (exclusive) dates', () => {
    const t = task({ startDate: '2026-10-05', endDate: '2026-10-20', archivedAt: '2026-10-15' });
    expect(isActive(t, '2026-10-04')).toBe(false);
    expect(isActive(t, '2026-10-05')).toBe(true);
    expect(isActive(t, '2026-10-14')).toBe(true);
    expect(isActive(t, '2026-10-15')).toBe(false);
    expect(lastActiveDay(t)).toBe('2026-10-14');
    expect(lastActiveDay(task({ endDate: '2026-10-20' }))).toBe('2026-10-20');
    expect(lastActiveDay(task())).toBeNull();
  });

  it('uses the rule in force on each day', () => {
    const t = task({
      startDate: '2026-10-01',
      rules: [{}, { effectiveFrom: '2026-10-15', schedule: { type: 'weekdays', days: [1, 4] } }],
    });
    expect(ruleAt(t, '2026-10-14').schedule.type).toBe('daily');
    expect(ruleAt(t, '2026-10-15').schedule.type).toBe('weekdays');
    expect(scheduledIn(t, '2026-10')).toHaveLength(14 + 5); // 1–14 daily, then 15,19,22,26,29
  });
});

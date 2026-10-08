import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  eachDay,
  isDateKey,
  isTime,
  trackingDay,
  weekdayOf,
  weekEndOf,
  weeksOfMonth,
  weekStartOf,
} from '../dates';

describe('dates', () => {
  it('computes weekdays (0=Sun … 6=Sat)', () => {
    expect(weekdayOf('2026-10-08')).toBe(4); // Thursday
    expect(weekdayOf('2026-10-10')).toBe(6); // Saturday
    expect(weekdayOf('1970-01-01')).toBe(4);
    expect(weekdayOf('1969-12-31')).toBe(3);
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
  });

  it('is unaffected by DST transitions', () => {
    // Late March / late October are DST switches in many regions.
    expect(eachDay('2026-03-27', '2026-04-01')).toHaveLength(6);
    expect(eachDay('2026-10-23', '2026-10-28')).toHaveLength(6);
  });

  it('validates keys', () => {
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-1-01')).toBe(false);
    expect(isTime('21:00')).toBe(true);
    expect(isTime('24:00')).toBe(false);
    expect(isTime('9:5')).toBe(false);
  });

  it('weeks run Saturday → Friday', () => {
    expect(weekStartOf('2026-10-08')).toBe('2026-10-03');
    expect(weekStartOf('2026-10-03')).toBe('2026-10-03');
    expect(weekEndOf('2026-10-03')).toBe('2026-10-09');
    expect(weekdayOf(weekEndOf('2026-10-08'))).toBe(5);
  });

  it('assigns each week to the month of its Friday', () => {
    // Fridays of Oct 2026: 2, 9, 16, 23, 30
    expect(weeksOfMonth('2026-10')).toEqual([
      '2026-09-26',
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
    ]);
    // Week of Oct 31 (Sat) ends Fri Nov 6 → November.
    expect(weeksOfMonth('2026-11')[0]).toBe('2026-10-31');
  });

  it('handles month arithmetic', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-10', -2)).toBe('2026-08');
    expect(daysInMonth('2028-02')).toBe(29);
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('keeps the previous day until the day boundary', () => {
    expect(trackingDay(new Date(2026, 9, 9, 1, 30), '03:00')).toBe('2026-10-08');
    expect(trackingDay(new Date(2026, 9, 9, 2, 59), '03:00')).toBe('2026-10-08');
    expect(trackingDay(new Date(2026, 9, 9, 3, 0), '03:00')).toBe('2026-10-09');
    expect(trackingDay(new Date(2026, 9, 9, 0, 0), '00:00')).toBe('2026-10-09');
    expect(trackingDay(new Date(2026, 0, 1, 1, 0), '03:00')).toBe('2025-12-31');
  });
});

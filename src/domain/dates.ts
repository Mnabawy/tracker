import type { DateKey, MonthKey, Weekday } from './types';

// Day arithmetic is done on integer day numbers (days since 1970-01-01 in a
// timezone-free calendar), so DST changes and device timezones can never shift
// a DateKey.

const MS_PER_DAY = 86_400_000;
const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

export const SATURDAY: Weekday = 6;
export const FRIDAY: Weekday = 5;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string') return false;
  const m = KEY_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonthOf(y, mo);
}

export function isMonthKey(value: unknown): value is MonthKey {
  if (typeof value !== 'string') return false;
  const m = MONTH_RE.exec(value);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function parseKey(key: DateKey): { year: number; month: number; day: number } {
  const m = KEY_RE.exec(key);
  if (!m) throw new Error(`Invalid DateKey: ${key}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function makeKey(year: number, month: number, day: number): DateKey {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function toDayNumber(key: DateKey): number {
  const { year, month, day } = parseKey(key);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromDayNumber(n: number): DateKey {
  const d = new Date(n * MS_PER_DAY);
  return makeKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromDayNumber(toDayNumber(key) + days);
}

/** b − a in days. */
export function diffDays(a: DateKey, b: DateKey): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function weekdayOf(key: DateKey): Weekday {
  // 1970-01-01 was a Thursday (4).
  return ((((toDayNumber(key) + 4) % 7) + 7) % 7) as Weekday;
}

export const minKey = (a: DateKey, b: DateKey): DateKey => (a <= b ? a : b);
export const maxKey = (a: DateKey, b: DateKey): DateKey => (a >= b ? a : b);

/** Inclusive range of days. Empty if from > to. */
export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const end = toDayNumber(to);
  for (let n = toDayNumber(from); n <= end; n++) out.push(fromDayNumber(n));
  return out;
}

// ---------------------------------------------------------------------------
// Local time → tracking day

/** The local calendar day of a JS Date. */
export function keyOfLocalDate(date: Date): DateKey {
  return makeKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** Parses 'HH:MM' into minutes after midnight. */
export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Invalid time: ${hhmm}`);
  return h * 60 + min;
}

export function isTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    parseTime(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The day a moment belongs to for tracking purposes. Before `dayStartsAt`
 * (e.g. '03:00') it still counts as the previous day, so a Witr prayed at
 * 1 AM is logged for the night it belongs to.
 */
export function trackingDay(now: Date, dayStartsAt: string): DateKey {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = keyOfLocalDate(now);
  return minutes < parseTime(dayStartsAt) ? addDays(today, -1) : today;
}

// ---------------------------------------------------------------------------
// Weeks run Saturday → Friday.

export function weekStartOf(key: DateKey): DateKey {
  const back = (weekdayOf(key) - SATURDAY + 7) % 7;
  return addDays(key, -back);
}

export function weekEndOf(key: DateKey): DateKey {
  return addDays(weekStartOf(key), 6);
}

// ---------------------------------------------------------------------------
// Months

function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthOf(key: DateKey): MonthKey {
  return key.slice(0, 7);
}

export function parseMonth(month: MonthKey): { year: number; month: number } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new Error(`Invalid MonthKey: ${month}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function daysInMonth(month: MonthKey): number {
  const { year, month: mo } = parseMonth(month);
  return daysInMonthOf(year, mo);
}

export function firstDayOfMonth(month: MonthKey): DateKey {
  return `${month}-01`;
}

export function lastDayOfMonth(month: MonthKey): DateKey {
  return `${month}-${pad(daysInMonth(month))}`;
}

export function daysOfMonth(month: MonthKey): DateKey[] {
  return eachDay(firstDayOfMonth(month), lastDayOfMonth(month));
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const { year, month: mo } = parseMonth(month);
  const idx = year * 12 + (mo - 1) + n;
  return `${pad(Math.floor(idx / 12), 4)}-${pad((idx % 12) + 1)}`;
}

/**
 * Saturday starts of the weeks that belong to a month. A week belongs to the
 * month its Friday falls in, so every week belongs to exactly one month.
 */
export function weeksOfMonth(month: MonthKey): DateKey[] {
  const first = firstDayOfMonth(month);
  const firstFriday = addDays(first, (FRIDAY - weekdayOf(first) + 7) % 7);
  const last = lastDayOfMonth(month);
  const out: DateKey[] = [];
  for (let friday = firstFriday; friday <= last; friday = addDays(friday, 7)) {
    out.push(addDays(friday, -6));
  }
  return out;
}

import { parseKey, weekdayOf } from '@/domain/dates';
import { toHijri } from '@/domain/hijri';
import type { DateKey } from '@/domain/types';

export type Numerals = 'arabic' | 'latin';

export const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export const GREGORIAN_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export const HIJRI_MONTHS = [
  'محرم',
  'صفر',
  'ربيع الأول',
  'ربيع الآخر',
  'جمادى الأولى',
  'جمادى الآخرة',
  'رجب',
  'شعبان',
  'رمضان',
  'شوال',
  'ذو القعدة',
  'ذو الحجة',
] as const;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Converts Western digits in a string to Arabic-Indic digits when requested. */
export function digits(text: string | number, numerals: Numerals): string {
  const s = String(text);
  return numerals === 'arabic' ? s.replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]!) : s;
}

/** 6.5 → "6½", 3.25 → "3.3", 7 → "7". */
export function formatAmount(n: number, numerals: Numerals): string {
  const whole = Math.floor(n);
  const frac = n - whole;
  let text: string;
  if (frac === 0) text = String(whole);
  else if (Math.abs(frac - 0.5) < 1e-9) text = whole === 0 ? '½' : `${whole}½`;
  else text = (Math.round(n * 10) / 10).toString();
  return digits(text, numerals);
}

/** 0.873 → "87٪" */
export function formatPercent(ratio: number, numerals: Numerals): string {
  return `${digits(Math.round(ratio * 100), numerals)}٪`;
}

/** "الخميس ٨ أكتوبر ٢٠٢٦" */
export function formatGregorian(key: DateKey, numerals: Numerals): string {
  const { year, month, day } = parseKey(key);
  return `${WEEKDAYS[weekdayOf(key)]} ${digits(day, numerals)} ${GREGORIAN_MONTHS[month - 1]} ${digits(year, numerals)}`;
}

/** "٢٧ ربيع الآخر ١٤٤٨ هـ", or null outside the supported range. */
export function formatHijri(key: DateKey, offset: number, numerals: Numerals): string | null {
  const h = toHijri(key, offset);
  if (!h) return null;
  return `${digits(h.day, numerals)} ${HIJRI_MONTHS[h.month - 1]} ${digits(h.year, numerals)} هـ`;
}

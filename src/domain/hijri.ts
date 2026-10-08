import { gregorianToHijri } from '@tabby_ai/hijri-converter';

import { addDays, parseKey } from './dates';
import type { DateKey, HijriDate } from './types';

export const HIJRI_OFFSET_MIN = -2;
export const HIJRI_OFFSET_MAX = 2;

/**
 * Umm al-Qura date for a day, shifted by `offset` days to match local moon
 * sighting (+1 means the local month started a day earlier than Umm al-Qura).
 * Returns null outside the supported range (1343–1500 AH, about 1924–2077).
 */
export function toHijri(key: DateKey, offset = 0): HijriDate | null {
  const { year, month, day } = parseKey(offset === 0 ? key : addDays(key, offset));
  try {
    return gregorianToHijri({ year, month, day });
  } catch {
    return null;
  }
}

/** Memoized Hijri day-of-month lookup for repeated schedule checks. */
export function hijriDayLookup(offset: number): (key: DateKey) => number | null {
  const cache = new Map<DateKey, number | null>();
  return (key) => {
    let v = cache.get(key);
    if (v === undefined) {
      v = toHijri(key, offset)?.day ?? null;
      cache.set(key, v);
    }
    return v;
  };
}

import { hijriDayLookup, toHijri } from '../hijri';

describe('hijri', () => {
  it('converts with Umm al-Qura', () => {
    expect(toHijri('2026-02-18')).toEqual({ year: 1447, month: 9, day: 1 }); // 1 Ramadan 1447
    expect(toHijri('2026-10-08')).toEqual({ year: 1448, month: 4, day: 27 });
  });

  it('applies the local-sighting offset', () => {
    expect(toHijri('2026-02-18', 1)).toEqual({ year: 1447, month: 9, day: 2 });
    expect(toHijri('2026-02-19', -1)).toEqual({ year: 1447, month: 9, day: 1 });
    expect(toHijri('2026-02-18', -1)?.month).toBe(8);
  });

  it('returns null out of range', () => {
    expect(toHijri('1900-01-01')).toBeNull();
    expect(toHijri('2100-01-01')).toBeNull();
  });

  it('memoizes day lookups', () => {
    const lookup = hijriDayLookup(0);
    expect(lookup('2026-02-18')).toBe(1);
    expect(lookup('2026-02-18')).toBe(1);
    expect(lookup('2100-01-01')).toBeNull();
  });
});

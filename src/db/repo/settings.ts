import { isTime } from '@/domain/dates';
import { HIJRI_OFFSET_MAX, HIJRI_OFFSET_MIN } from '@/domain/hijri';

import type { Database } from '../database';

export interface Reminder {
  enabled: boolean;
  /** 'HH:MM' */
  time: string;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  dailyReminder: Reminder;
  /** Fires on Fridays. */
  weeklyReminder: Reminder;
  /** Before this time it is still "yesterday". */
  dayStartsAt: string;
  hijriOffset: number;
  numerals: 'arabic' | 'latin';
  /** ISO timestamp of first-launch seeding; null until seeded. */
  seededAt: string | null;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  dailyReminder: { enabled: true, time: '21:00' },
  weeklyReminder: { enabled: true, time: '17:00' },
  dayStartsAt: '03:00',
  hijriOffset: 0,
  numerals: 'arabic',
  seededAt: null,
};

const isReminder = (v: unknown): v is Reminder =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Reminder).enabled === 'boolean' &&
  isTime((v as Reminder).time);

const VALIDATORS: { [K in keyof Settings]: (v: unknown) => v is Settings[K] } = {
  theme: (v): v is Settings['theme'] => v === 'system' || v === 'light' || v === 'dark',
  dailyReminder: isReminder,
  weeklyReminder: isReminder,
  dayStartsAt: isTime,
  hijriOffset: (v): v is number =>
    typeof v === 'number' && Number.isInteger(v) && v >= HIJRI_OFFSET_MIN && v <= HIJRI_OFFSET_MAX,
  numerals: (v): v is Settings['numerals'] => v === 'arabic' || v === 'latin',
  seededAt: (v): v is string | null => v === null || typeof v === 'string',
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];

export function isValidSetting<K extends keyof Settings>(key: K, value: unknown): value is Settings[K] {
  return VALIDATORS[key](value);
}

/** Stored settings over defaults; unknown keys and invalid values are ignored. */
export function getSettings(db: Database): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of db.all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    if (!(row.key in DEFAULT_SETTINGS)) continue;
    const key = row.key as keyof Settings;
    try {
      const value: unknown = JSON.parse(row.value);
      if (isValidSetting(key, value)) (out as Record<keyof Settings, unknown>)[key] = value;
    } catch {
      // keep default
    }
  }
  return out;
}

export function updateSettings(db: Database, patch: Partial<Settings>): void {
  const entries = Object.entries(patch) as [keyof Settings, unknown][];
  for (const [key, value] of entries) {
    if (!(key in DEFAULT_SETTINGS) || !isValidSetting(key, value)) {
      throw new Error(`Invalid setting ${String(key)}: ${JSON.stringify(value)}`);
    }
  }
  db.transaction(() => {
    for (const [key, value] of entries) {
      db.run(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    }
  });
}

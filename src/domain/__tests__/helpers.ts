import type { RuleContent } from '../rules';
import { makeScheduleContext } from '../schedule';
import type { DateKey, EntryIndex, Schedule, Task, TaskRule } from '../types';

export const ctx = makeScheduleContext(0);

const binaryDaily: RuleContent = {
  tracking: 'binary',
  target: null,
  unit: null,
  schedule: { type: 'daily' },
};

let seq = 0;

export function task(
  overrides: Partial<Omit<Task, 'rules'>> & { rules?: Partial<TaskRule>[]; schedule?: Schedule } = {},
): Task {
  const { rules, schedule, ...rest } = overrides;
  const startDate = rest.startDate ?? '2026-01-01';
  const baseRule = { ...binaryDaily, ...(schedule ? { schedule } : {}) };
  return {
    id: rest.id ?? `t${++seq}`,
    name: 'task',
    categoryId: null,
    criteria: null,
    sortOrder: 0,
    endDate: null,
    archivedAt: null,
    reminderTime: null,
    templateKey: null,
    ...rest,
    startDate,
    rules: (rules ?? [{}]).map((r, i) => ({
      ...baseRule,
      effectiveFrom: i === 0 ? startDate : '9999-12-31',
      ...r,
    })),
  };
}

/** entries({ t1: { '2026-10-01': 1 } }) */
export function entries(data: Record<string, Record<DateKey, number>>): EntryIndex {
  const idx: EntryIndex = new Map();
  for (const [taskId, days] of Object.entries(data)) {
    idx.set(taskId, new Map(Object.entries(days)));
  }
  return idx;
}

export function fill(days: DateKey[], value = 1): Record<DateKey, number> {
  return Object.fromEntries(days.map((d) => [d, value]));
}

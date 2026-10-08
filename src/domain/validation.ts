import { isDateKey, isTime } from './dates';
import type { RuleContent } from './rules';
import type { DateKey } from './types';

/** Everything the add/edit form produces. */
export interface TaskDraft extends RuleContent {
  name: string;
  categoryId: string | null;
  criteria: string | null;
  startDate: DateKey;
  endDate: DateKey | null;
  reminderTime: string | null;
  templateKey: string | null;
}

export type DraftError =
  | 'name_required'
  | 'start_date_invalid'
  | 'end_date_invalid'
  | 'end_before_start'
  | 'reminder_time_invalid'
  | 'target_required'
  | 'weekdays_required'
  | 'hijri_days_required'
  | 'weekly_quota_invalid';

export const MAX_TARGET = 100_000;

const isIntIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

export function validateRuleContent(rule: RuleContent): DraftError[] {
  const errors: DraftError[] = [];
  if (rule.tracking !== 'binary' && !isIntIn(rule.target, 1, MAX_TARGET)) {
    errors.push('target_required');
  }
  const s = rule.schedule;
  if (s.type === 'weekdays' && (s.days.length === 0 || !s.days.every((d) => isIntIn(d, 0, 6)))) {
    errors.push('weekdays_required');
  }
  if (s.type === 'hijri_days' && (s.days.length === 0 || !s.days.every((d) => isIntIn(d, 1, 30)))) {
    errors.push('hijri_days_required');
  }
  if (s.type === 'weekly_quota' && !isIntIn(s.perWeek, 1, 7)) {
    errors.push('weekly_quota_invalid');
  }
  return errors;
}

export function validateDraft(draft: TaskDraft): DraftError[] {
  const errors: DraftError[] = [];
  if (!draft.name.trim()) errors.push('name_required');
  if (!isDateKey(draft.startDate)) errors.push('start_date_invalid');
  if (draft.endDate !== null) {
    if (!isDateKey(draft.endDate)) errors.push('end_date_invalid');
    else if (isDateKey(draft.startDate) && draft.endDate < draft.startDate) {
      errors.push('end_before_start');
    }
  }
  if (draft.reminderTime !== null && !isTime(draft.reminderTime)) {
    errors.push('reminder_time_invalid');
  }
  return [...errors, ...validateRuleContent(draft)];
}

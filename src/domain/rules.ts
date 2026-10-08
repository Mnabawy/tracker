import { maxKey } from './dates';
import type { DateKey, Schedule, TaskRule } from './types';

export type RuleContent = Omit<TaskRule, 'effectiveFrom'>;

function canonicalSchedule(s: Schedule): Schedule {
  if (s.type === 'weekdays' || s.type === 'hijri_days') {
    const days = [...new Set<number>(s.days)].sort((a, b) => a - b);
    return { ...s, days } as Schedule;
  }
  return s;
}

/** Picks just the rule fields out of a larger object (e.g. a form draft). */
export function ruleContentOf(x: RuleContent): RuleContent {
  return { tracking: x.tracking, target: x.target, unit: x.unit, schedule: x.schedule };
}

export function canonicalRule<T extends RuleContent>(rule: T): T {
  return {
    ...rule,
    target: rule.tracking === 'binary' ? null : rule.target,
    unit: rule.tracking === 'count' ? rule.unit?.trim() || null : null,
    schedule: canonicalSchedule(rule.schedule),
  };
}

export function sameRuleContent(a: RuleContent, b: RuleContent): boolean {
  const ca = canonicalRule(a);
  const cb = canonicalRule(b);
  return (
    ca.tracking === cb.tracking &&
    ca.target === cb.target &&
    ca.unit === cb.unit &&
    JSON.stringify(ca.schedule) === JSON.stringify(cb.schedule)
  );
}

/**
 * Brings a rule history into canonical shape for a task starting on
 * `startDate`:
 * - sorted, one rule per effectiveFrom (the later one in the input wins),
 * - the first rule starts exactly on startDate (rules fully superseded before
 *   startDate are dropped),
 * - consecutive rules with identical content are merged.
 */
export function normalizeRules(rules: TaskRule[], startDate: DateKey): TaskRule[] {
  if (rules.length === 0) throw new Error('A task needs at least one rule');

  const byDate = new Map<DateKey, TaskRule>();
  for (const r of rules) byDate.set(r.effectiveFrom, canonicalRule(r));
  const sorted = [...byDate.values()].sort((a, b) =>
    a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0,
  );

  // Index of the rule in force on startDate (or the first one if all start later).
  let firstIdx = 0;
  sorted.forEach((r, i) => {
    if (r.effectiveFrom <= startDate) firstIdx = i;
  });
  const kept = sorted.slice(firstIdx);
  kept[0] = { ...kept[0]!, effectiveFrom: startDate };

  const out: TaskRule[] = [];
  for (const r of kept) {
    const prev = out[out.length - 1];
    if (prev && sameRuleContent(prev, r)) continue;
    out.push(r);
  }
  return out;
}

/**
 * Applies edited tracking/target/schedule to a rule history.
 * - 'from': the change takes effect on `from` (normally today); earlier days
 *   keep the rules they had.
 * - 'all': the change rewrites the whole history.
 */
export function applyRuleChange(
  rules: TaskRule[],
  content: RuleContent,
  mode: 'from' | 'all',
  from: DateKey,
  startDate: DateKey,
): TaskRule[] {
  const picked = ruleContentOf(content);
  if (mode === 'all') {
    return normalizeRules([{ ...picked, effectiveFrom: startDate }], startDate);
  }
  const effectiveFrom = maxKey(from, startDate);
  const before = rules.filter((r) => r.effectiveFrom < effectiveFrom);
  return normalizeRules([...before, { ...picked, effectiveFrom }], startDate);
}

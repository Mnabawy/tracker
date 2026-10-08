import { applyRuleChange, normalizeRules, type RuleContent } from '../rules';
import type { TaskRule } from '../types';

const binary: RuleContent = { tracking: 'binary', target: null, unit: null, schedule: { type: 'daily' } };
const pages = (n: number): RuleContent => ({
  tracking: 'count',
  target: n,
  unit: 'صفحة',
  schedule: { type: 'daily' },
});
const at = (effectiveFrom: string, c: RuleContent): TaskRule => ({ ...c, effectiveFrom });

describe('normalizeRules', () => {
  it('anchors the first rule to the start date and drops superseded rules', () => {
    const rules = [at('2026-01-01', pages(5)), at('2026-03-01', pages(8)), at('2026-06-01', pages(10))];
    expect(normalizeRules(rules, '2026-04-01')).toEqual([
      at('2026-04-01', pages(8)),
      at('2026-06-01', pages(10)),
    ]);
    expect(normalizeRules(rules, '2025-12-01')[0]).toEqual(at('2025-12-01', pages(5)));
  });

  it('merges consecutive identical rules and sorts', () => {
    const rules = [at('2026-05-01', pages(5)), at('2026-01-01', pages(5)), at('2026-09-01', pages(6))];
    expect(normalizeRules(rules, '2026-01-01')).toEqual([
      at('2026-01-01', pages(5)),
      at('2026-09-01', pages(6)),
    ]);
  });

  it('canonicalizes content (sorted unique days, no target for binary)', () => {
    const [r] = normalizeRules(
      [at('2026-01-01', { ...binary, target: 7, schedule: { type: 'weekdays', days: [4, 1, 4] } })],
      '2026-01-01',
    );
    expect(r).toEqual(at('2026-01-01', { ...binary, schedule: { type: 'weekdays', days: [1, 4] } }));
  });
});

describe('applyRuleChange', () => {
  const history = [at('2026-01-01', pages(5))];

  it("'from' keeps the past and starts the new rule on the given day", () => {
    expect(applyRuleChange(history, pages(10), 'from', '2026-10-08', '2026-01-01')).toEqual([
      at('2026-01-01', pages(5)),
      at('2026-10-08', pages(10)),
    ]);
  });

  it("'from' replaces a rule already starting that day (editing twice in one day)", () => {
    const once = applyRuleChange(history, pages(10), 'from', '2026-10-08', '2026-01-01');
    expect(applyRuleChange(once, pages(12), 'from', '2026-10-08', '2026-01-01')).toEqual([
      at('2026-01-01', pages(5)),
      at('2026-10-08', pages(12)),
    ]);
  });

  it("'from' with unchanged content adds no version", () => {
    expect(applyRuleChange(history, pages(5), 'from', '2026-10-08', '2026-01-01')).toEqual(history);
  });

  it("'from' before the start date applies from the start", () => {
    expect(applyRuleChange(history, pages(9), 'from', '2025-06-01', '2026-01-01')).toEqual([
      at('2026-01-01', pages(9)),
    ]);
  });

  it("'all' rewrites the whole history", () => {
    const two = [at('2026-01-01', pages(5)), at('2026-06-01', pages(8))];
    expect(applyRuleChange(two, pages(3), 'all', '2026-10-08', '2026-01-01')).toEqual([
      at('2026-01-01', pages(3)),
    ]);
  });
});

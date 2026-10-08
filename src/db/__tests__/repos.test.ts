import { makeScheduleContext } from '@/domain/schedule';
import { monthStats } from '@/domain/stats';
import { DEFAULT_TASKS } from '@/domain/templates';
import type { TaskDraft } from '@/domain/validation';

import { deleteCategory, ensureCategory, listCategories } from '../repo/categories';
import { loadEntries, setEntry } from '../repo/entries';
import { getMonthlyNote, getWeeklyReview, setMonthlyNote, setWeeklyReview } from '../repo/notes';
import { DEFAULT_SETTINGS, getSettings, updateSettings } from '../repo/settings';
import {
  archiveTask,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  reorderTasks,
  TaskValidationError,
  unarchiveTask,
  updateTask,
} from '../repo/tasks';
import { seedIfNeeded } from '../seed';
import { openTestDatabase } from './nodeDb';

const draft = (overrides: Partial<TaskDraft> = {}): TaskDraft => ({
  name: 'القرآن',
  categoryId: null,
  criteria: null,
  startDate: '2026-10-01',
  endDate: null,
  reminderTime: null,
  templateKey: null,
  tracking: 'binary',
  target: null,
  unit: null,
  schedule: { type: 'daily' },
  ...overrides,
});

describe('seed', () => {
  it('seeds the 8 default tasks once, starting on the 1st of the month', () => {
    const db = openTestDatabase();
    expect(seedIfNeeded(db, '2026-10-08')).toBe(true);
    const tasks = listTasks(db);
    expect(tasks.map((t) => t.name)).toEqual(DEFAULT_TASKS.map((t) => t.name));
    expect(tasks.every((t) => t.startDate === '2026-10-01')).toBe(true);
    expect(tasks[0]!.rules).toEqual([
      { effectiveFrom: '2026-10-01', tracking: 'binary', target: null, unit: null, schedule: { type: 'daily' } },
    ]);
    expect(getSettings(db).seededAt).not.toBeNull();

    expect(seedIfNeeded(db, '2026-10-09')).toBe(false);
    expect(listTasks(db)).toHaveLength(8);
  });

  it('does not re-add defaults after the user deleted them', () => {
    const db = openTestDatabase();
    seedIfNeeded(db, '2026-10-08');
    for (const t of listTasks(db)) deleteTask(db, t.id);
    seedIfNeeded(db, '2026-10-09');
    expect(listTasks(db)).toEqual([]);
  });
});

describe('tasks repo', () => {
  it('creates tasks in order with trimmed fields', () => {
    const db = openTestDatabase();
    const a = createTask(db, draft({ name: '  الضحى ', criteria: '  ' }));
    const b = createTask(db, draft({ name: 'صدقة', schedule: { type: 'weekly_quota', perWeek: 2 } }));
    expect(a.name).toBe('الضحى');
    expect(a.criteria).toBeNull();
    expect(listTasks(db).map((t) => t.id)).toEqual([a.id, b.id]);
    expect(getTask(db, b.id)?.rules[0]?.schedule).toEqual({ type: 'weekly_quota', perWeek: 2 });
  });

  it('rejects invalid drafts', () => {
    const db = openTestDatabase();
    expect(() => createTask(db, draft({ name: ' ' }))).toThrow(TaskValidationError);
    expect(() => createTask(db, draft({ tracking: 'count', target: null, endDate: '2026-09-01' }))).toThrow(
      expect.objectContaining({ errors: ['end_before_start', 'target_required'] }),
    );
    expect(listTasks(db)).toEqual([]);
  });

  it("edits apply from today by default and keep the past's rules", () => {
    const db = openTestDatabase();
    const t = createTask(db, draft({ tracking: 'count', target: 5, unit: 'صفحة' }));
    const edited = updateTask(db, t.id, draft({ name: 'ورد القرآن', tracking: 'count', target: 10, unit: 'صفحة' }), {
      ruleChange: 'from',
      today: '2026-10-15',
    });
    expect(edited.name).toBe('ورد القرآن');
    expect(edited.rules.map((r) => [r.effectiveFrom, r.target])).toEqual([
      ['2026-10-01', 5],
      ['2026-10-15', 10],
    ]);

    const rewritten = updateTask(db, t.id, draft({ tracking: 'count', target: 8, unit: 'صفحة' }), {
      ruleChange: 'all',
      today: '2026-10-15',
    });
    expect(rewritten.rules.map((r) => [r.effectiveFrom, r.target])).toEqual([['2026-10-01', 8]]);
  });

  it('moving the start date re-anchors the rule history', () => {
    const db = openTestDatabase();
    const t = createTask(db, draft());
    const moved = updateTask(db, t.id, draft({ startDate: '2026-09-01' }), { ruleChange: 'from', today: '2026-10-08' });
    expect(moved.startDate).toBe('2026-09-01');
    expect(moved.rules.map((r) => r.effectiveFrom)).toEqual(['2026-09-01']);
  });

  it('reorders, archives, unarchives and deletes', () => {
    const db = openTestDatabase();
    const [a, b, c] = ['أ', 'ب', 'ج'].map((name) => createTask(db, draft({ name })));
    reorderTasks(db, [c!.id, a!.id]);
    expect(listTasks(db).map((t) => t.name)).toEqual(['ج', 'أ', 'ب']);

    setEntry(db, b!.id, '2026-10-02', 1);
    archiveTask(db, b!.id, '2026-10-08');
    expect(getTask(db, b!.id)?.archivedAt).toBe('2026-10-08');
    expect(loadEntries(db).get(b!.id)?.get('2026-10-02')).toBe(1); // history kept
    unarchiveTask(db, b!.id);
    expect(getTask(db, b!.id)?.archivedAt).toBeNull();

    deleteTask(db, b!.id);
    expect(getTask(db, b!.id)).toBeNull();
    expect(loadEntries(db).has(b!.id)).toBe(false);
    expect(db.all('SELECT * FROM task_rules WHERE task_id = ?', [b!.id])).toEqual([]);
  });
});

describe('entries repo', () => {
  it('upserts, clears and filters entries', () => {
    const db = openTestDatabase();
    const t = createTask(db, draft());
    const u = createTask(db, draft({ name: 'x' }));
    setEntry(db, t.id, '2026-10-01', 0.5);
    setEntry(db, t.id, '2026-10-01', 1);
    setEntry(db, t.id, '2026-10-02', 1);
    setEntry(db, u.id, '2026-10-03', 1);
    setEntry(db, t.id, '2026-10-02', 0);

    expect([...loadEntries(db).get(t.id)!]).toEqual([['2026-10-01', 1]]);
    expect(loadEntries(db, { from: '2026-10-02' }).has(t.id)).toBe(false);
    expect(loadEntries(db, { to: '2026-10-02' }).has(u.id)).toBe(false);
    expect([...loadEntries(db, { taskId: u.id }).keys()]).toEqual([u.id]);
    expect(() => setEntry(db, t.id, '2026-10-01', Number.NaN)).toThrow();
  });

  it('rejects entries for unknown tasks', () => {
    const db = openTestDatabase();
    expect(() => setEntry(db, 'missing', '2026-10-01', 1)).toThrow();
  });
});

describe('categories repo', () => {
  it('dedupes by name and uncategorizes tasks on delete', () => {
    const db = openTestDatabase();
    const c = ensureCategory(db, ' عبادة ');
    expect(ensureCategory(db, 'عبادة').id).toBe(c.id);
    ensureCategory(db, 'علم');
    expect(listCategories(db).map((x) => x.name)).toEqual(['عبادة', 'علم']);

    const t = createTask(db, draft({ categoryId: c.id }));
    deleteCategory(db, c.id);
    expect(getTask(db, t.id)?.categoryId).toBeNull();
  });
});

describe('notes repo', () => {
  it('stores weekly reviews and monthly notes; empty text removes them', () => {
    const db = openTestDatabase();
    setWeeklyReview(db, '2026-10-03', 'الوتر — بسبب السهر');
    setMonthlyNote(db, '2026-10', 'اللهم أعني على ذكرك');
    expect(getWeeklyReview(db, '2026-10-03')).toBe('الوتر — بسبب السهر');
    expect(getMonthlyNote(db, '2026-10')).toBe('اللهم أعني على ذكرك');
    setWeeklyReview(db, '2026-10-03', '  ');
    expect(getWeeklyReview(db, '2026-10-03')).toBeNull();
  });
});

describe('settings repo', () => {
  it('returns defaults, persists updates, rejects invalid values', () => {
    const db = openTestDatabase();
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
    updateSettings(db, { hijriOffset: 1, dailyReminder: { enabled: false, time: '21:30' } });
    expect(getSettings(db)).toMatchObject({ hijriOffset: 1, dailyReminder: { enabled: false, time: '21:30' } });
    expect(() => updateSettings(db, { hijriOffset: 5 })).toThrow();
    expect(() => updateSettings(db, { dayStartsAt: '25:00' })).toThrow();
  });

  it('falls back to defaults for corrupted stored values', () => {
    const db = openTestDatabase();
    db.run("INSERT INTO settings (key, value) VALUES ('theme', 'not json'), ('numerals', '\"roman\"')");
    expect(getSettings(db)).toEqual(DEFAULT_SETTINGS);
  });
});

describe('repos + stats', () => {
  it('computes a month from stored data', () => {
    const db = openTestDatabase();
    const fast = createTask(db, draft({ name: 'صيام', schedule: { type: 'weekdays', days: [1, 4] } }));
    const quran = createTask(db, draft({ tracking: 'count', target: 10, unit: 'صفحة' }));
    setEntry(db, fast.id, '2026-10-01', 1);
    setEntry(db, fast.id, '2026-10-05', 1);
    setEntry(db, quran.id, '2026-10-01', 10);
    setEntry(db, quran.id, '2026-10-02', 5);

    const s = monthStats(listTasks(db), '2026-10', loadEntries(db), makeScheduleContext(0), '2026-11-01');
    expect(s.tasks.map((r) => [r.earned, r.possible])).toEqual([
      [2, 9],
      [1.5, 31],
    ]);
    expect(s.total).toMatchObject({ earned: 3.5, possible: 40 });
  });
});

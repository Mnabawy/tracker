import {
  BackupError,
  exportBackup,
  importBackup,
  parseBackup,
  serializeBackup,
  wipeAllData,
} from '../backup';
import { ensureCategory } from '../repo/categories';
import { setEntry } from '../repo/entries';
import { setMonthlyNote, setWeeklyReview } from '../repo/notes';
import { updateSettings } from '../repo/settings';
import { createTask, listTasks, updateTask } from '../repo/tasks';
import { seedIfNeeded } from '../seed';
import { openTestDatabase } from './nodeDb';

const NOW = new Date('2026-10-08T18:00:00Z');

function populated() {
  const db = openTestDatabase();
  seedIfNeeded(db, '2026-10-08');
  const cat = ensureCategory(db, 'علم');
  const t = createTask(db, {
    name: 'قراءة',
    categoryId: cat.id,
    criteria: 'كتاب نافع',
    startDate: '2026-10-01',
    endDate: '2026-11-09',
    reminderTime: '20:00',
    templateKey: null,
    tracking: 'duration',
    target: 30,
    unit: null,
    schedule: { type: 'hijri_days', days: [13, 14, 15] },
  });
  updateTask(db, t.id, { ...t, ...t.rules[0]!, target: 45 }, { ruleChange: 'from', today: '2026-10-08' });
  const [first] = listTasks(db);
  setEntry(db, first!.id, '2026-10-01', 1);
  setEntry(db, first!.id, '2026-10-02', 0.5);
  setEntry(db, t.id, '2026-10-05', 20);
  setWeeklyReview(db, '2026-10-03', 'الضحى');
  setMonthlyNote(db, '2026-10', 'دعاء');
  updateSettings(db, { hijriOffset: -1, numerals: 'latin' });
  return db;
}

describe('backup', () => {
  it('round-trips everything through JSON', () => {
    const source = populated();
    const text = serializeBackup(exportBackup(source, NOW));

    const target = openTestDatabase();
    seedIfNeeded(target, '2026-10-08'); // existing data gets replaced
    importBackup(target, parseBackup(text));

    expect(exportBackup(target, NOW)).toEqual(exportBackup(source, NOW));
    expect(exportBackup(target, NOW).data.task_rules).toHaveLength(8 + 2);
  });

  it('wipes all data', () => {
    const db = populated();
    wipeAllData(db);
    const { data } = exportBackup(db, NOW);
    expect(Object.values(data).every((v) => (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0))).toBe(
      true,
    );
  });

  const reason = (text: string) => {
    try {
      parseBackup(text);
    } catch (e) {
      return (e as BackupError).reason;
    }
    return 'ok';
  };

  it('rejects files that are not backups', () => {
    expect(reason('{oops')).toBe('not_json');
    expect(reason('{"app":"other"}')).toBe('wrong_app');
    expect(reason('{"app":"daily-tracker","schemaVersion":99,"data":{}}')).toBe('newer_version');
    expect(reason('{"app":"daily-tracker","schemaVersion":1,"data":{}}')).toBe('ok');
  });

  it('rejects inconsistent data without touching the database', () => {
    const db = populated();
    const good = exportBackup(db, NOW);
    const mutate = (fn: (b: typeof good) => void) => {
      const b = JSON.parse(serializeBackup(good)) as typeof good;
      fn(b);
      return reason(JSON.stringify(b));
    };

    expect(mutate((b) => (b.data.entries[0]!.task_id = 'ghost'))).toBe('invalid_data');
    expect(mutate((b) => (b.data.entries[0]!.value = -1))).toBe('invalid_data');
    expect(mutate((b) => (b.data.tasks[0]!.start_date = '2026-02-30'))).toBe('invalid_data');
    expect(mutate((b) => (b.data.task_rules[0]!.schedule_type = 'weekdays'))).toBe('invalid_data'); // no days
    expect(mutate((b) => (b.data.task_rules = b.data.task_rules.slice(1)))).toBe('invalid_data'); // task without rules
    expect(mutate((b) => b.data.tasks.push({ ...b.data.tasks[0]! }))).toBe('invalid_data'); // duplicate id
    expect(mutate((b) => ((b.data.settings as Record<string, unknown>).theme = 'neon'))).toBe('ok'); // dropped

    expect(exportBackup(db, NOW)).toEqual(good);
  });
});

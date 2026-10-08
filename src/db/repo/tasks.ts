import { applyRuleChange, canonicalRule, normalizeRules, ruleContentOf } from '@/domain/rules';
import type { DateKey, Task, TaskRule } from '@/domain/types';
import { type DraftError, type TaskDraft, validateDraft } from '@/domain/validation';

import type { Database } from '../database';
import { newId, nowIso } from '../ids';
import {
  insertSql,
  RULE_COLUMNS,
  type RuleRow,
  ruleFromRow,
  ruleToRow,
  TASK_COLUMNS,
  type TaskRow,
  taskFromRow,
} from '../rows';

export class TaskValidationError extends Error {
  constructor(readonly errors: DraftError[]) {
    super(`Invalid task: ${errors.join(', ')}`);
    this.name = 'TaskValidationError';
  }
}

function assertValid(draft: TaskDraft): void {
  const errors = validateDraft(draft);
  if (errors.length > 0) throw new TaskValidationError(errors);
}

const clean = (s: string | null): string | null => s?.trim() || null;

/** All tasks, archived included, in board order. Callers filter as needed. */
export function listTasks(db: Database): Task[] {
  const rows = db.all<TaskRow>('SELECT * FROM tasks ORDER BY sort_order, created_at');
  const ruleRows = db.all<RuleRow>('SELECT * FROM task_rules ORDER BY task_id, effective_from');
  const rulesByTask = new Map<string, TaskRule[]>();
  for (const r of ruleRows) {
    const list = rulesByTask.get(r.task_id) ?? [];
    list.push(ruleFromRow(r));
    rulesByTask.set(r.task_id, list);
  }
  return rows
    .map((r) => taskFromRow(r, rulesByTask.get(r.id) ?? []))
    .filter((t) => t.rules.length > 0);
}

export function getTask(db: Database, id: string): Task | null {
  const row = db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!row) return null;
  const rules = db
    .all<RuleRow>('SELECT * FROM task_rules WHERE task_id = ? ORDER BY effective_from', [id])
    .map(ruleFromRow);
  return rules.length > 0 ? taskFromRow(row, rules) : null;
}

function writeRules(db: Database, taskId: string, rules: TaskRule[]): void {
  db.run('DELETE FROM task_rules WHERE task_id = ?', [taskId]);
  for (const rule of rules) db.run(...insertSql('task_rules', RULE_COLUMNS, ruleToRow(taskId, rule)));
}

export function createTask(db: Database, draft: TaskDraft): Task {
  assertValid(draft);
  const id = newId();
  const now = nowIso();
  db.transaction(() => {
    const max = db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM tasks')?.m ?? -1;
    const row: TaskRow = {
      id,
      name: draft.name.trim(),
      category_id: draft.categoryId,
      criteria: clean(draft.criteria),
      sort_order: max + 1,
      start_date: draft.startDate,
      end_date: draft.endDate,
      archived_at: null,
      reminder_time: draft.reminderTime,
      template_key: draft.templateKey,
      created_at: now,
      updated_at: now,
    };
    db.run(...insertSql('tasks', TASK_COLUMNS, row));
    writeRules(db, id, [canonicalRule({ ...ruleContentOf(draft), effectiveFrom: draft.startDate })]);
  });
  return getTask(db, id)!;
}

export interface UpdateOptions {
  /**
   * How tracking/target/schedule changes apply: from `today` on (past days keep
   * their old rules) or to the whole history.
   */
  ruleChange: 'from' | 'all';
  today: DateKey;
}

export function updateTask(db: Database, id: string, draft: TaskDraft, opts: UpdateOptions): Task {
  assertValid(draft);
  const existing = getTask(db, id);
  if (!existing) throw new Error(`Task ${id} not found`);

  const rules = applyRuleChange(
    normalizeRules(existing.rules, draft.startDate),
    draft,
    opts.ruleChange,
    opts.today,
    draft.startDate,
  );

  db.transaction(() => {
    db.run(
      `UPDATE tasks SET name = ?, category_id = ?, criteria = ?, start_date = ?, end_date = ?,
         reminder_time = ?, updated_at = ? WHERE id = ?`,
      [
        draft.name.trim(),
        draft.categoryId,
        clean(draft.criteria),
        draft.startDate,
        draft.endDate,
        draft.reminderTime,
        nowIso(),
        id,
      ],
    );
    writeRules(db, id, rules);
  });
  return getTask(db, id)!;
}

/** Persists a new board order; ids not listed keep their relative order after the listed ones. */
export function reorderTasks(db: Database, orderedIds: string[]): void {
  const all = db.all<{ id: string }>('SELECT id FROM tasks ORDER BY sort_order, created_at').map((r) => r.id);
  const existing = new Set(all);
  const listed = new Set(orderedIds);
  const final = [...orderedIds.filter((id) => existing.has(id)), ...all.filter((id) => !listed.has(id))];
  db.transaction(() => {
    final.forEach((id, i) => db.run('UPDATE tasks SET sort_order = ? WHERE id = ?', [i, id]));
  });
}

/** Stops scheduling from `day` on; history and past stats are kept. */
export function archiveTask(db: Database, id: string, day: DateKey): void {
  db.run('UPDATE tasks SET archived_at = ?, updated_at = ? WHERE id = ?', [day, nowIso(), id]);
}

export function unarchiveTask(db: Database, id: string): void {
  db.run('UPDATE tasks SET archived_at = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]);
}

/** Permanently removes the task, its rules and all its entries. */
export function deleteTask(db: Database, id: string): void {
  db.run('DELETE FROM tasks WHERE id = ?', [id]);
}

/** A form draft pre-filled from a task and one of its rules (normally the one in force today). */
export function draftFromTask(task: Task, rule: TaskRule): TaskDraft {
  return {
    name: task.name,
    categoryId: task.categoryId,
    criteria: task.criteria,
    startDate: task.startDate,
    endDate: task.endDate,
    reminderTime: task.reminderTime,
    templateKey: task.templateKey,
    tracking: rule.tracking,
    target: rule.target,
    unit: rule.unit,
    schedule: rule.schedule,
  };
}

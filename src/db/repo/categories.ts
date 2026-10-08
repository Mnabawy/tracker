import type { Category } from '@/domain/types';

import type { Database } from '../database';
import { newId } from '../ids';
import type { CategoryRow } from '../rows';

const fromRow = (r: CategoryRow): Category => ({ id: r.id, name: r.name, sortOrder: r.sort_order });

export function listCategories(db: Database): Category[] {
  return db.all<CategoryRow>('SELECT * FROM categories ORDER BY sort_order, name').map(fromRow);
}

/** Creates a category, or returns the existing one with the same name. */
export function ensureCategory(db: Database, name: string): Category {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');
  return db.transaction(() => {
    const existing = db.get<CategoryRow>('SELECT * FROM categories WHERE name = ?', [trimmed]);
    if (existing) return fromRow(existing);
    const max = db.get<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM categories')?.m ?? -1;
    const row: CategoryRow = { id: newId(), name: trimmed, sort_order: max + 1 };
    db.run('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)', [row.id, row.name, row.sort_order]);
    return fromRow(row);
  });
}

export function renameCategory(db: Database, id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Category name is required');
  db.run('UPDATE categories SET name = ? WHERE id = ?', [trimmed, id]);
}

/** Tasks in the category become uncategorized. */
export function deleteCategory(db: Database, id: string): void {
  db.run('DELETE FROM categories WHERE id = ?', [id]);
}

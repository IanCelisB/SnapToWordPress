// src/db/store-categories.ts — typed CRUD for `store_categories`.

import type { StoreCategory } from '../domain/types';
import type { DB } from './index';

type Row = {
  wc_category_id: number;
  name: string;
  parent_id: number | null;
  cached_at: number;
};

function fromRow(row: Row): StoreCategory {
  return {
    wcCategoryId: row.wc_category_id,
    name: row.name,
    parentId: row.parent_id,
    cachedAt: row.cached_at,
  };
}

export async function upsertCategory(
  db: DB,
  category: StoreCategory,
): Promise<void> {
  await db.run(
    `INSERT INTO store_categories (wc_category_id, name, parent_id, cached_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(wc_category_id) DO UPDATE SET
       name = excluded.name,
       parent_id = excluded.parent_id,
       cached_at = excluded.cached_at`,
    [
      category.wcCategoryId,
      category.name,
      category.parentId,
      category.cachedAt,
    ],
  );
}

export async function listCategories(db: DB): Promise<StoreCategory[]> {
  const rows = await db.query<Row>(
    'SELECT * FROM store_categories ORDER BY name ASC',
  );
  return rows.map(fromRow);
}

export async function getCategory(
  db: DB,
  id: number,
): Promise<StoreCategory | null> {
  const row = await db.queryOne<Row>(
    'SELECT * FROM store_categories WHERE wc_category_id = ?',
    [id],
  );
  return row ? fromRow(row) : null;
}

export async function deleteCategory(db: DB, id: number): Promise<void> {
  await db.run('DELETE FROM store_categories WHERE wc_category_id = ?', [id]);
}

export async function mostRecentCachedAt(
  db: DB,
): Promise<number | null> {
  const row = await db.queryOne<{ max: number | null }>(
    'SELECT MAX(cached_at) as max FROM store_categories',
  );
  return row?.max ?? null;
}

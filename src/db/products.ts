// src/db/products.ts — typed CRUD for the `products` table.
//
// All public functions accept a `DB` so the worker, the review-queue
// store, and the test suite can use the same code path with their own
// transaction-scoped handle.

import type { Product, NewProduct, ProductStatus } from '../domain/types';
import type { DB } from './index';

type ProductRow = {
  local_id: string;
  name: string;
  price: number;
  category_id: number | null;
  category_name: string | null;
  description: string | null;
  status: ProductStatus;
  publish_on_sync: number;
  price_confirmed: number;
  wc_product_id: number | null;
  last_error_key: string | null;
  last_attempt_at: number | null;
  next_attempt_at: number | null;
  created_at: number;
  updated_at: number;
};

function fromRow(row: ProductRow): Product {
  return {
    localId: row.local_id,
    name: row.name,
    price: row.price,
    categoryId: row.category_id,
    categoryName: row.category_name,
    description: row.description,
    status: row.status,
    publishOnSync: row.publish_on_sync === 1,
    priceConfirmed: row.price_confirmed === 1,
    wcProductId: row.wc_product_id,
    lastErrorKey: (row.last_error_key ?? null) as Product['lastErrorKey'],
    lastAttemptAt: row.last_attempt_at,
    nextAttemptAt: row.next_attempt_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function insertProduct(
  db: DB,
  product: NewProduct,
  now: number,
): Promise<void> {
  await db.run(
    `INSERT INTO products (
      local_id, name, price, category_id, category_name, description,
      status, publish_on_sync, price_confirmed,
      wc_product_id, last_error_key, last_attempt_at, next_attempt_at,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
    [
      product.localId,
      product.name,
      product.price,
      product.categoryId,
      product.categoryName,
      product.description,
      product.status ?? 'pending',
      product.publishOnSync === true ? 1 : 0,
      product.priceConfirmed === true ? 1 : 0,
      now,
      now,
    ],
  );
}

export async function updateProduct(
  db: DB,
  id: string,
  patch: Partial<Omit<Product, 'localId' | 'createdAt'>>,
  now: number,
): Promise<void> {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  if (patch.name !== undefined) {
    fields.push('name = ?');
    values.push(patch.name);
  }
  if (patch.price !== undefined) {
    fields.push('price = ?');
    values.push(patch.price);
  }
  if (patch.categoryId !== undefined) {
    fields.push('category_id = ?');
    values.push(patch.categoryId);
  }
  if (patch.categoryName !== undefined) {
    fields.push('category_name = ?');
    values.push(patch.categoryName);
  }
  if (patch.description !== undefined) {
    fields.push('description = ?');
    values.push(patch.description);
  }
  if (patch.status !== undefined) {
    fields.push('status = ?');
    values.push(patch.status);
  }
  if (patch.publishOnSync !== undefined) {
    fields.push('publish_on_sync = ?');
    values.push(patch.publishOnSync ? 1 : 0);
  }
  if (patch.priceConfirmed !== undefined) {
    fields.push('price_confirmed = ?');
    values.push(patch.priceConfirmed ? 1 : 0);
  }
  if (patch.wcProductId !== undefined) {
    fields.push('wc_product_id = ?');
    values.push(patch.wcProductId);
  }
  if (patch.lastErrorKey !== undefined) {
    fields.push('last_error_key = ?');
    values.push(patch.lastErrorKey);
  }
  if (patch.lastAttemptAt !== undefined) {
    fields.push('last_attempt_at = ?');
    values.push(patch.lastAttemptAt);
  }
  if (patch.nextAttemptAt !== undefined) {
    fields.push('next_attempt_at = ?');
    values.push(patch.nextAttemptAt);
  }
  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);
  await db.run(
    `UPDATE products SET ${fields.join(', ')} WHERE local_id = ?`,
    values,
  );
}

export async function getProduct(
  db: DB,
  id: string,
): Promise<Product | null> {
  const row = await db.queryOne<ProductRow>(
    'SELECT * FROM products WHERE local_id = ?',
    [id],
  );
  return row ? fromRow(row) : null;
}

export async function listProductsForSync(db: DB): Promise<Product[]> {
  const rows = await db.query<ProductRow>(
    `SELECT * FROM products
     WHERE status IN ('pending','ready')
     ORDER BY created_at ASC`,
  );
  return rows.map(fromRow);
}

export async function listProductsByStatus(
  db: DB,
  status: ProductStatus,
): Promise<Product[]> {
  const rows = await db.query<ProductRow>(
    'SELECT * FROM products WHERE status = ? ORDER BY created_at DESC',
    [status],
  );
  return rows.map(fromRow);
}

export async function listAllProducts(db: DB): Promise<Product[]> {
  const rows = await db.query<ProductRow>(
    'SELECT * FROM products ORDER BY created_at DESC',
  );
  return rows.map(fromRow);
}

export async function deleteProduct(db: DB, id: string): Promise<void> {
  await db.run('DELETE FROM products WHERE local_id = ?', [id]);
}

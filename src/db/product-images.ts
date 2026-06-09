// src/db/product-images.ts — typed CRUD for `product_images`.

import type { ProductImage, NewProductImage, ProductImageSyncState } from '../domain/types';
import type { DB } from './index';

type ImageRow = {
  id: number;
  product_local_id: string;
  file_path: string;
  position: number;
  sync_state: ProductImageSyncState;
  created_at: number;
};

function fromRow(row: ImageRow): ProductImage {
  return {
    id: row.id,
    productLocalId: row.product_local_id,
    filePath: row.file_path,
    position: row.position,
    syncState: row.sync_state,
    createdAt: row.created_at,
  };
}

export async function insertImage(
  db: DB,
  image: NewProductImage,
  now: number,
): Promise<number> {
  const result = await db.run(
    `INSERT INTO product_images
      (product_local_id, file_path, position, sync_state, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      image.productLocalId,
      image.filePath,
      image.position,
      image.syncState ?? 'pending',
      now,
    ],
  );
  return result.lastInsertRowId;
}

export async function listImagesForProduct(
  db: DB,
  productLocalId: string,
): Promise<ProductImage[]> {
  const rows = await db.query<ImageRow>(
    `SELECT * FROM product_images
     WHERE product_local_id = ? AND sync_state != 'excluded'
     ORDER BY position ASC`,
    [productLocalId],
  );
  return rows.map(fromRow);
}

export async function setImageSyncState(
  db: DB,
  id: number,
  syncState: ProductImageSyncState,
): Promise<void> {
  await db.run('UPDATE product_images SET sync_state = ? WHERE id = ?', [
    syncState,
    id,
  ]);
}

export async function deleteImage(db: DB, id: number): Promise<void> {
  await db.run('DELETE FROM product_images WHERE id = ?', [id]);
}

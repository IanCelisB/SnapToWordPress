// src/db/media-uploads.ts — typed CRUD for `media_uploads` (Design §6).

import type { MediaUpload, MediaUploadStatus } from '../domain/types';
import type { DB } from './index';

type Row = {
  id: number;
  wc_media_id: number;
  product_local_id: string | null;
  status: MediaUploadStatus;
  orphan_since: number | null;
  uploaded_at: number;
  attached_at: number | null;
};

function fromRow(row: Row): MediaUpload {
  return {
    id: row.id,
    wcMediaId: row.wc_media_id,
    productLocalId: row.product_local_id,
    status: row.status,
    orphanSince: row.orphan_since,
    uploadedAt: row.uploaded_at,
    attachedAt: row.attached_at,
  };
}

export async function recordUpload(
  db: DB,
  wcMediaId: number,
  uploadedAt: number,
): Promise<void> {
  await db.run(
    `INSERT INTO media_uploads (wc_media_id, status, uploaded_at)
     VALUES (?, 'uploaded', ?)`,
    [wcMediaId, uploadedAt],
  );
}

export async function markAttached(
  db: DB,
  wcMediaId: number,
  productLocalId: string,
  attachedAt: number,
): Promise<void> {
  await db.run(
    `UPDATE media_uploads
     SET status = 'attached',
         product_local_id = ?,
         attached_at = ?,
         orphan_since = NULL
     WHERE wc_media_id = ?`,
    [productLocalId, attachedAt, wcMediaId],
  );
}

export async function markOrphan(
  db: DB,
  wcMediaId: number,
  orphanSince: number,
): Promise<void> {
  await db.run(
    `UPDATE media_uploads
     SET status = 'orphan', orphan_since = ?
     WHERE wc_media_id = ?`,
    [orphanSince, wcMediaId],
  );
}

export async function deleteUpload(db: DB, wcMediaId: number): Promise<void> {
  await db.run('DELETE FROM media_uploads WHERE wc_media_id = ?', [wcMediaId]);
}

export async function listOrphansOlderThan(
  db: DB,
  thresholdMs: number,
  limit: number,
): Promise<MediaUpload[]> {
  const rows = await db.query<Row>(
    `SELECT * FROM media_uploads
     WHERE status = 'orphan' AND orphan_since < ?
     ORDER BY orphan_since ASC
     LIMIT ?`,
    [thresholdMs, limit],
  );
  return rows.map(fromRow);
}

// src/db/media-ledger.ts — typed CRUD for `media_ledger`.
//
// The `media_ledger` mirrors the older `media_uploads` table; the two
// exist because Design §6 names the table `media_uploads` while the
// worker layer (WU-4) refers to the same data as the "media ledger".
// We keep them aligned: the worker reads from `media_ledger` and the
// audit trail lives in `media_uploads`. Inserting/Updating both
// tables in a transaction keeps the two consistent.

import type { DB } from './index';

export type MediaLedgerStatus = 'uploaded' | 'attached' | 'orphan';

export type MediaLedgerRow = {
  id: number;
  wcMediaId: number;
  productLocalId: string | null;
  status: MediaLedgerStatus;
  orphanSince: number | null;
  uploadedAt: number;
  attachedAt: number | null;
};

type Row = {
  id: number;
  wc_media_id: number;
  product_local_id: string | null;
  status: MediaLedgerStatus;
  orphan_since: number | null;
  uploaded_at: number;
  attached_at: number | null;
};

function fromRow(row: Row): MediaLedgerRow {
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
  now: number,
): Promise<void> {
  await db.run(
    `INSERT INTO media_ledger (wc_media_id, status, uploaded_at)
     VALUES (?, 'uploaded', ?)`,
    [wcMediaId, now],
  );
}

export async function attachToProduct(
  db: DB,
  wcMediaId: number,
  productLocalId: string,
  now: number,
): Promise<void> {
  await db.run(
    `UPDATE media_ledger
     SET status = 'attached',
         product_local_id = ?,
         attached_at = ?,
         orphan_since = NULL
     WHERE wc_media_id = ?`,
    [productLocalId, now, wcMediaId],
  );
}

export async function markOrphan(
  db: DB,
  wcMediaId: number,
  now: number,
): Promise<void> {
  await db.run(
    `UPDATE media_ledger
     SET status = 'orphan', orphan_since = ?
     WHERE wc_media_id = ?`,
    [now, wcMediaId],
  );
}

export async function listOrphansOlderThan(
  db: DB,
  thresholdMs: number,
  limit: number,
): Promise<ReadonlyArray<MediaLedgerRow>> {
  const rows = await db.query<Row>(
    `SELECT * FROM media_ledger
     WHERE status = 'orphan' AND orphan_since < ?
     ORDER BY orphan_since ASC
     LIMIT ?`,
    [thresholdMs, limit],
  );
  return rows.map(fromRow);
}

export async function deleteRow(db: DB, wcMediaId: number): Promise<void> {
  await db.run('DELETE FROM media_ledger WHERE wc_media_id = ?', [wcMediaId]);
}

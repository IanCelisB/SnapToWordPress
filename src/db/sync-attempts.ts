// src/db/sync-attempts.ts — typed CRUD for `sync_attempts` (Design §6).

import type { SyncAttempt, NewSyncAttempt, ErrorKey } from '../domain/types';
import type { DB } from './index';

type Row = {
  id: number;
  product_local_id: string;
  attempted_at: number;
  error_class: SyncAttempt['errorClass'];
  error_key: string;
  http_status: number | null;
  attempt_in_run: number;
};

function fromRow(row: Row): SyncAttempt {
  return {
    id: row.id,
    productLocalId: row.product_local_id,
    attemptedAt: row.attempted_at,
    errorClass: row.error_class,
    errorKey: row.error_key as ErrorKey,
    httpStatus: row.http_status,
    attemptInRun: row.attempt_in_run,
  };
}

export async function recordAttempt(
  db: DB,
  attempt: NewSyncAttempt,
): Promise<void> {
  await db.run(
    `INSERT INTO sync_attempts
      (product_local_id, attempted_at, error_class, error_key, http_status, attempt_in_run)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      attempt.productLocalId,
      attempt.attemptedAt,
      attempt.errorClass,
      attempt.errorKey,
      attempt.httpStatus,
      attempt.attemptInRun,
    ],
  );
}

export async function listAttemptsForProduct(
  db: DB,
  productLocalId: string,
): Promise<SyncAttempt[]> {
  const rows = await db.query<Row>(
    `SELECT * FROM sync_attempts
     WHERE product_local_id = ?
     ORDER BY attempted_at DESC`,
    [productLocalId],
  );
  return rows.map(fromRow);
}

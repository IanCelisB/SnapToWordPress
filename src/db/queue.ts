// src/db/queue.ts — typed CRUD for the `sync_queue` table.
//
// The `sync_queue` table is the worker's serial queue. A product moves
// into the queue when it's `pending`/`ready` and out of it when it
// reaches a terminal state. The two key methods are:
//
//   - `enqueue(db, productLocalId, now)` — adds a row (idempotent: if
//     the product is already in the queue, returns the existing row).
//   - `claimNext(db, now)` — atomically picks the next `queued` row,
//     marks it `in-flight`, and returns it. The atomicity is enforced
//     by the `withTransaction` block: `UPDATE ... WHERE status = 'queued'`
//     followed by `SELECT ... WHERE id = last_insert_rowid()` style.
//
// The worker is the only writer of `attempt_count`, `last_error_key`,
// and `claimed_at`. The review-queue store (WU-3) writes via `enqueue`
// when the user moves a product from `pending` → `ready`.

import type { QueueItem, ErrorKey } from '../domain/types';
import type { DB } from './index';

type Row = {
  id: number;
  product_local_id: string;
  enqueued_at: number;
  status: QueueItem['status'];
  attempt_count: number;
  next_attempt_at: number;
  last_error_key: string | null;
  claimed_at: number | null;
};

function fromRow(row: Row): QueueItem {
  return {
    id: row.id,
    productLocalId: row.product_local_id,
    enqueuedAt: row.enqueued_at,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at,
    lastErrorKey: (row.last_error_key ?? null) as ErrorKey | null,
    claimedAt: row.claimed_at,
  };
}

export async function enqueue(
  db: DB,
  productLocalId: string,
  now: number,
): Promise<QueueItem> {
  // INSERT OR IGNORE then SELECT — the unique constraint on
  // `product_local_id` is the atomicity guarantee.
  await db.run(
    `INSERT OR IGNORE INTO sync_queue
      (product_local_id, enqueued_at, status, attempt_count, next_attempt_at)
     VALUES (?, ?, 'queued', 0, ?)`,
    [productLocalId, now, now],
  );
  const row = await db.queryOne<Row>(
    'SELECT * FROM sync_queue WHERE product_local_id = ?',
    [productLocalId],
  );
  if (!row) {
    // Should be impossible — the INSERT just succeeded or was a no-op.
    throw new Error('queue: row missing after INSERT OR IGNORE');
  }
  return fromRow(row);
}

export async function claimNext(
  db: DB,
  now: number,
): Promise<QueueItem | null> {
  let claimed: QueueItem | null = null;
  await db.transaction(async (tx) => {
    const row = await tx.queryOne<Row>(
      `SELECT * FROM sync_queue
       WHERE status = 'queued' AND next_attempt_at <= ?
       ORDER BY next_attempt_at ASC
       LIMIT 1`,
      [now],
    );
    if (!row) {
      claimed = null;
      return;
    }
    await tx.run(
      `UPDATE sync_queue
       SET status = 'in-flight', claimed_at = ?
       WHERE id = ?`,
      [now, row.id],
    );
    const updated = await tx.queryOne<Row>(
      'SELECT * FROM sync_queue WHERE id = ?',
      [row.id],
    );
    claimed = updated ? fromRow(updated) : null;
  });
  return claimed;
}

export async function completeItem(
  db: DB,
  productLocalId: string,
): Promise<void> {
  await db.run('DELETE FROM sync_queue WHERE product_local_id = ?', [
    productLocalId,
  ]);
}

export async function failItem(
  db: DB,
  productLocalId: string,
  nextAttemptAt: number,
  errorKey: ErrorKey,
): Promise<void> {
  await db.run(
    `UPDATE sync_queue
     SET status = 'queued',
         attempt_count = attempt_count + 1,
         next_attempt_at = ?,
         last_error_key = ?
     WHERE product_local_id = ?`,
    [nextAttemptAt, errorKey, productLocalId],
  );
}

export async function markFailed(
  db: DB,
  productLocalId: string,
  errorKey: ErrorKey,
): Promise<void> {
  await db.run(
    `UPDATE sync_queue
     SET status = 'failed',
         last_error_key = ?
     WHERE product_local_id = ?`,
    [errorKey, productLocalId],
  );
}

export async function listQueued(
  db: DB,
): Promise<ReadonlyArray<QueueItem>> {
  const rows = await db.query<Row>(
    `SELECT * FROM sync_queue ORDER BY next_attempt_at ASC`,
  );
  return rows.map(fromRow);
}

export async function getByProduct(
  db: DB,
  productLocalId: string,
): Promise<QueueItem | null> {
  const row = await db.queryOne<Row>(
    'SELECT * FROM sync_queue WHERE product_local_id = ?',
    [productLocalId],
  );
  return row ? fromRow(row) : null;
}

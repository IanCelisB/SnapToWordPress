// src/db/app-config.ts — typed CRUD for `app_config` (Design §6).

import type { DB } from './index';

export async function getConfig(
  db: DB,
  key: string,
): Promise<string | null> {
  const row = await db.queryOne<{ value: string }>(
    'SELECT value FROM app_config WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function getConfigNumber(
  db: DB,
  key: string,
): Promise<number | null> {
  const raw = await getConfig(db, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getConfigBoolean(
  db: DB,
  key: string,
): Promise<boolean | null> {
  const raw = await getConfig(db, key);
  if (raw === null) return null;
  return raw === '1';
}

export async function setConfig(
  db: DB,
  key: string,
  value: string,
): Promise<void> {
  await db.run(
    `INSERT INTO app_config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function setConfigBoolean(
  db: DB,
  key: string,
  value: boolean,
): Promise<void> {
  await setConfig(db, key, value ? '1' : '0');
}

export async function listAllConfig(
  db: DB,
): Promise<ReadonlyArray<{ key: string; value: string }>> {
  return db.query<{ key: string; value: string }>(
    'SELECT key, value FROM app_config',
  );
}

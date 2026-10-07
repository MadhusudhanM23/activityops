import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Applies the schema. Idempotent - every statement is CREATE ... IF NOT EXISTS,
 * so this runs safely on every boot against the EBS-backed database.
 */
export function migrate(db: DatabaseSync): void {
  db.exec(readFileSync(join(here, 'schema.sql'), 'utf8'));
}

/**
 * Spec sec. 16 "Delete All Data".
 *
 * DROP TABLE is used rather than DELETE because verification_attempt carries an
 * anti-delete trigger that protects the audit history from ordinary deletion.
 * Wiping the store is an explicit, operator-initiated act, so it is allowed to
 * remove the tables outright and rebuild them empty.
 */
export function deleteAllData(db: DatabaseSync): void {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];

  db.exec('PRAGMA foreign_keys = OFF;');
  for (const { name } of tables) db.exec(`DROP TABLE IF EXISTS "${name}";`);
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
}

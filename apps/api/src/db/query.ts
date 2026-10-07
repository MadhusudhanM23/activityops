import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

/**
 * Thin typed wrappers over node:sqlite.
 *
 * The driver returns `Record<string, SQLOutputValue>`, which does not structurally
 * match our row interfaces. Casting in one place keeps the assertion auditable
 * instead of scattering `as unknown as` through the domain layer. Row shapes are
 * still only as correct as the SELECT that produced them, so queries list their
 * columns explicitly rather than using `SELECT *` where the shape matters.
 */

export function rows<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

export function row<T>(db: DatabaseSync, sql: string, ...params: SQLInputValue[]): T | undefined {
  return db.prepare(sql).get(...params) as unknown as T | undefined;
}

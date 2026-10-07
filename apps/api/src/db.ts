import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

/**
 * Authoritative store. Single application writer + WAL, per spec v7 sec. 18.
 * Uses the Node built-in SQLite driver so the deployment image needs no native
 * toolchain (see DECISIONS.md D-002).
 */
export function openDatabase(path = config.DATABASE_PATH): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

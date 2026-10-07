import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

/**
 * Audit log (spec v7 sec. 23). Actions include PASS, FAIL, APPROVE, OVERRIDE,
 * DISMISS, RECHECK, DELETE.
 *
 * Metadata holds normalized identifiers only - never a Ring token, never a raw
 * provider payload, never a raw model prompt (sec. 16, 24).
 */
export interface AuditInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  at: Date;
  metadata?: Record<string, unknown>;
}

export function writeAudit(db: DatabaseSync, input: AuditInput): void {
  db.prepare(
    'INSERT INTO audit_log (id, actor, action, entity_type, entity_id, timestamp, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    randomUUID(),
    input.actor,
    input.action,
    input.entityType,
    input.entityId,
    input.at.toISOString(),
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
}

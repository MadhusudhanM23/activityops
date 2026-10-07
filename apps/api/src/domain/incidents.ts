import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError, ERR } from './errors.js';
import { writeAudit } from './audit.js';
import type { IncidentSeverity, IncidentStatus } from './types.js';

/**
 * Incident lifecycle (spec v7 sec. 13).
 *
 *   OPEN -> ACKNOWLEDGED -> ACTION_REQUIRED -> RECHECKING -> READY_TO_RESOLVE -> RESOLVED
 *   any pre-resolved state -> DISMISSED(reason)
 *
 * Two rules carry the weight:
 *   - at most one open incident per check;
 *   - dismissing an incident does not erase the failed attempt that caused it.
 */

const TRANSITIONS: Record<IncidentStatus, readonly IncidentStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'ACTION_REQUIRED', 'RECHECKING', 'DISMISSED'],
  ACKNOWLEDGED: ['ACTION_REQUIRED', 'RECHECKING', 'DISMISSED'],
  ACTION_REQUIRED: ['RECHECKING', 'DISMISSED'],
  RECHECKING: ['READY_TO_RESOLVE', 'ACTION_REQUIRED', 'DISMISSED'],
  READY_TO_RESOLVE: ['RESOLVED', 'ACTION_REQUIRED', 'DISMISSED'],
  RESOLVED: [],
  DISMISSED: [],
};

export interface IncidentRow {
  id: string;
  check_id: string;
  run_id: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reason: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
}

export function getIncident(db: DatabaseSync, id: string): IncidentRow {
  const row = db.prepare('SELECT * FROM incident WHERE id = ?').get(id) as IncidentRow | undefined;
  if (!row) throw new DomainError(ERR.NOT_FOUND, `No incident ${id}`);
  return row;
}

export function openIncidentForCheck(
  db: DatabaseSync,
  checkId: string,
): IncidentRow | undefined {
  return db
    .prepare(
      `SELECT * FROM incident WHERE check_id = ? AND status NOT IN ('RESOLVED', 'DISMISSED')`,
    )
    .get(checkId) as IncidentRow | undefined;
}

export interface RaiseIncidentInput {
  checkId: string;
  runId: string | null;
  severity: IncidentSeverity;
  reason: string;
  actor: string;
  now: Date;
}

/**
 * Creates the incident for a failure, or attaches to the existing open one.
 *
 * A repeat failure never produces a second open incident (sec. 13); it is logged
 * as an action on the incident that is already open, and escalates the severity
 * if the new failure is worse.
 */
export function raiseOrAttachIncident(db: DatabaseSync, input: RaiseIncidentInput): IncidentRow {
  const existing = openIncidentForCheck(db, input.checkId);
  if (existing) {
    const order: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'BLOCKER'];
    if (order.indexOf(input.severity) > order.indexOf(existing.severity)) {
      db.prepare('UPDATE incident SET severity = ? WHERE id = ?').run(input.severity, existing.id);
    }
    db.prepare(
      'INSERT INTO incident_action (id, incident_id, action, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      randomUUID(),
      existing.id,
      'REPEAT_FAILURE',
      input.reason,
      input.actor,
      input.now.toISOString(),
    );
    return getIncident(db, existing.id);
  }

  const id = randomUUID();
  db.prepare(
    'INSERT INTO incident (id, check_id, run_id, severity, status, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    input.checkId,
    input.runId,
    input.severity,
    'OPEN',
    input.reason,
    input.now.toISOString(),
  );
  db.prepare(
    'INSERT INTO incident_action (id, incident_id, action, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), id, 'OPEN', input.reason, input.actor, input.now.toISOString());

  writeAudit(db, {
    actor: input.actor,
    action: 'OPEN_INCIDENT',
    entityType: 'incident',
    entityId: id,
    at: input.now,
    metadata: { checkId: input.checkId, severity: input.severity },
  });
  return getIncident(db, id);
}

export interface TransitionInput {
  incidentId: string;
  to: IncidentStatus;
  actor: string;
  reason?: string;
  now: Date;
}

/**
 * Advances an incident. RESOLVED requires a named human approver and DISMISSED
 * requires a reason; neither is reachable by the AI copilot (sec. 13/17).
 */
export function transitionIncident(db: DatabaseSync, input: TransitionInput): IncidentRow {
  const incident = getIncident(db, input.incidentId);
  const allowed = TRANSITIONS[incident.status];
  if (!allowed.includes(input.to)) {
    throw new DomainError(
      ERR.INVALID_INCIDENT_TRANSITION,
      `An incident cannot move from ${incident.status} to ${input.to}.`,
    );
  }
  if (input.to === 'RESOLVED' && !input.actor) {
    throw new DomainError(ERR.RESOLUTION_APPROVER_REQUIRED, 'Resolution requires an approver.');
  }
  if (input.to === 'DISMISSED' && !input.reason?.trim()) {
    throw new DomainError(ERR.INVALID_INCIDENT_TRANSITION, 'Dismissal requires a reason.');
  }

  const at = input.now.toISOString();
  if (input.to === 'RESOLVED') {
    db.prepare('UPDATE incident SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?').run(
      input.to,
      at,
      input.actor,
      incident.id,
    );
  } else if (input.to === 'DISMISSED') {
    db.prepare(
      'UPDATE incident SET status = ?, dismissed_at = ?, dismissed_reason = ? WHERE id = ?',
    ).run(input.to, at, input.reason ?? null, incident.id);
  } else {
    db.prepare('UPDATE incident SET status = ? WHERE id = ?').run(input.to, incident.id);
  }

  db.prepare(
    'INSERT INTO incident_action (id, incident_id, action, reason, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(randomUUID(), incident.id, input.to, input.reason ?? null, input.actor, at);

  writeAudit(db, {
    actor: input.actor,
    action: input.to === 'DISMISSED' ? 'DISMISS' : input.to,
    entityType: 'incident',
    entityId: incident.id,
    at: input.now,
    metadata: { from: incident.status, to: input.to },
  });

  return getIncident(db, incident.id);
}

/** Severity for a failed check (sec. 13). */
export function severityForFailure(required: boolean): IncidentSeverity {
  return required ? 'HIGH' : 'MEDIUM';
}

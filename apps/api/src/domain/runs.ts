import type { DatabaseSync } from 'node:sqlite';
import { DomainError, ERR } from './errors.js';
import { rows } from '../db/query.js';
import { writeAudit } from './audit.js';
import { transitionIncident } from './incidents.js';
import { deriveReadiness, type CheckSnapshot, type ReadinessResult, type RunSnapshot } from './readiness.js';
import { hasQualifyingEvidence, latestAttempt } from './attempts.js';
import type { AttemptStatus, IncidentSeverity, IntegrationState } from './types.js';

/** Reads the current Ring integration overlay (sec. 10/11). */
export function getIntegrationState(db: DatabaseSync): IntegrationState {
  const row = db.prepare("SELECT state FROM integration_state WHERE id = 'ring'").get() as
    | { state: IntegrationState }
    | undefined;
  return row?.state ?? 'HEALTHY';
}

/**
 * Records an integration observation. Called for 401/403/429/timeout/malformed
 * response/aborted sync - conditions that are explicitly NOT negative evidence
 * about the site, so this never touches checks, incidents or attempts.
 */
export function setIntegrationState(
  db: DatabaseSync,
  state: IntegrationState,
  detail: string | null,
  now: Date,
): void {
  db.prepare(
    `INSERT INTO integration_state (id, state, detail, observed_at) VALUES ('ring', ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET state = excluded.state, detail = excluded.detail, observed_at = excluded.observed_at`,
  ).run(state, detail, now.toISOString());
}

interface CheckRow {
  id: string;
  label: string;
  required: number;
  requirement_type: 'RING_REQUIRED' | 'NON_RING';
  device_id: string | null;
  device_status: string | null;
}

/**
 * Assembles the readiness input from storage.
 *
 * `deviceUnavailable` is true only for a CONFIRMED unavailable device. A device
 * whose status is still UNKNOWN - including because the integration is down -
 * must not produce a blocker (sec. 10).
 */
export function buildRunSnapshot(db: DatabaseSync, runId: string, now: Date = new Date()): RunSnapshot {
  const run = db
    .prepare('SELECT template_id, approved_at, cancelled_at FROM verification_run WHERE id = ?')
    .get(runId) as
    | { template_id: string; approved_at: string | null; cancelled_at: string | null }
    | undefined;
  if (!run) throw new DomainError(ERR.NOT_FOUND, `No run ${runId}`);

  const checkRows = rows<CheckRow>(
    db,
    `SELECT c.id, c.label, c.required, c.requirement_type, c.device_id, d.status AS device_status
         FROM verification_check c
         LEFT JOIN device d ON d.id = c.device_id
        WHERE c.template_id = ?
        ORDER BY c.sort_order, c.id`,
    run.template_id,
  );

  const checks: CheckSnapshot[] = checkRows.map((row) => {
    const attempt = latestAttempt(db, runId, row.id);
    const coverage = attempt
      ? (db
          .prepare('SELECT reached_older FROM sync_coverage WHERE attempt_id = ?')
          .get(attempt.id) as { reached_older: number } | undefined)
      : undefined;

    const windowExpired =
      attempt?.armed_at != null && attempt.window_seconds != null
        ? new Date(attempt.armed_at).getTime() + attempt.window_seconds * 1000 < now.getTime()
        : false;

    return {
      checkId: row.id,
      label: row.label,
      required: row.required === 1,
      requirementType: row.requirement_type,
      latestAttempt: attempt
        ? {
            status: attempt.status as AttemptStatus,
            hasQualifyingRingEvidence: hasQualifyingEvidence(db, attempt.id),
          }
        : null,
      deviceUnavailable: row.device_status === 'UNAVAILABLE',
      // sec. 10 Case B: all three conditions must hold together.
      coveredWindowExpiredWithoutSession:
        row.requirement_type === 'RING_REQUIRED' &&
        windowExpired &&
        coverage?.reached_older === 1 &&
        attempt !== undefined &&
        !hasQualifyingEvidence(db, attempt.id) &&
        attempt.status === 'IN_PROGRESS',
    };
  });

  const openIncidents = rows<{ id: string; check_id: string; severity: IncidentSeverity }>(
    db,
    `SELECT id, check_id, severity FROM incident WHERE status NOT IN ('RESOLVED', 'DISMISSED')`,
  );

  return {
    cancelledAt: run.cancelled_at,
    approvedAt: run.approved_at,
    integrationState: getIntegrationState(db),
    checks,
    openIncidents: openIncidents.map((i) => ({
      incidentId: i.id,
      checkId: i.check_id,
      severity: i.severity,
    })),
  };
}

export function readiness(db: DatabaseSync, runId: string, now: Date = new Date()): ReadinessResult {
  return deriveReadiness(buildRunSnapshot(db, runId, now));
}

/**
 * Final approval (sec. 11/14).
 *
 * Only reachable from READY_TO_APPROVE, and only by a person - the AI copilot has
 * no write tools at all. The label is deliberately neutral ("Approval"), since
 * the MVP has a single login and must not imply two-person control.
 */
export function approveRun(db: DatabaseSync, runId: string, approver: string, now: Date): void {
  const result = readiness(db, runId, now);
  if (result.status !== 'READY_TO_APPROVE') {
    throw new DomainError(
      ERR.RUN_NOT_APPROVABLE,
      `This run is ${result.status} and cannot be approved yet.`,
    );
  }
  db.prepare(
    'UPDATE verification_run SET approved_at = ?, approval_actor_id = ?, completed_at = ? WHERE id = ?',
  ).run(now.toISOString(), approver, now.toISOString(), runId);

  writeAudit(db, {
    actor: approver,
    action: 'APPROVE',
    entityType: 'verification_run',
    entityId: runId,
    at: now,
  });
}

export function cancelRun(db: DatabaseSync, runId: string, actor: string, now: Date): void {
  const run = db
    .prepare('SELECT approved_at, cancelled_at FROM verification_run WHERE id = ?')
    .get(runId) as { approved_at: string | null; cancelled_at: string | null } | undefined;
  if (!run) throw new DomainError(ERR.NOT_FOUND, `No run ${runId}`);
  if (run.approved_at) {
    throw new DomainError(ERR.RUN_TERMINAL, 'An approved run is terminal and cannot be cancelled.');
  }
  db.prepare('UPDATE verification_run SET cancelled_at = ? WHERE id = ?').run(
    now.toISOString(),
    runId,
  );
  writeAudit(db, {
    actor,
    action: 'CANCEL_RUN',
    entityType: 'verification_run',
    entityId: runId,
    at: now,
  });

  // Coverage incidents this run raised that no person has acted on (every action is
  // the system's) are about this run's own check windows. Only one incident can be
  // open per check (sec. 13), so left open they would block every later run. They
  // are dismissed under the canceller's name, with a reason, in the same transaction.
  // Operator FAILs - real site problems - and anything a person touched stay open (D-064).
  const untouched = rows<{ id: string }>(
    db,
    `SELECT i.id FROM incident i
      WHERE i.run_id = ? AND i.status NOT IN ('RESOLVED', 'DISMISSED')
        AND NOT EXISTS (SELECT 1 FROM incident_action a WHERE a.incident_id = i.id AND a.actor <> 'system')`,
    runId,
  );
  for (const { id } of untouched) {
    transitionIncident(db, {
      incidentId: id,
      to: 'DISMISSED',
      actor,
      reason: "Run cancelled - this coverage incident was about that run's check window, which no longer applies",
      now,
    });
  }
}

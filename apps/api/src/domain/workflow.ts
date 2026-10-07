import type { DatabaseSync } from 'node:sqlite';
import {
  attest,
  cancelAttempt,
  claimEvidence,
  eligibleWindow,
  getAttempt,
  startAttempt,
  type AttemptRow,
} from './attempts.js';
import {
  openIncidentForCheck,
  raiseOrAttachIncident,
  severityForFailure,
  transitionIncident,
} from './incidents.js';
import { buildRunSnapshot } from './runs.js';
import { deriveReadiness } from './readiness.js';
import { row, rows } from '../db/query.js';

/**
 * Operator workflow (spec v7 sec. 3, 12, 13).
 *
 * Composes the immutable Phase 2 primitives into the steps an operator takes.
 * The incident moves with the attempts - OPEN on failure, RECHECKING when a
 * recheck starts, READY_TO_RESOLVE when it passes - but the system NEVER moves
 * an incident to RESOLVED. That always takes a named person (sec. 1: a recheck
 * is never automatic resolution).
 */

export const SYSTEM_ACTOR = 'system';

interface CheckInfo {
  id: string;
  required: number;
  label: string;
}

function checkInfo(db: DatabaseSync, checkId: string): CheckInfo | undefined {
  return row<CheckInfo>(db, 'SELECT id, required, label FROM verification_check WHERE id = ?', checkId);
}

export interface StartCheckInput {
  runId: string;
  checkId: string;
  actor: string;
  now: Date;
  skewSeconds: number;
  windowSeconds?: number;
}

/** Arms a check. A recheck moves an open incident to RECHECKING. */
export function startCheck(db: DatabaseSync, input: StartCheckInput): AttemptRow {
  const attempt = startAttempt(db, input);

  if (attempt.supersedes_attempt_id) {
    const incident = openIncidentForCheck(db, input.checkId);
    if (incident && ['OPEN', 'ACKNOWLEDGED', 'ACTION_REQUIRED'].includes(incident.status)) {
      transitionIncident(db, {
        incidentId: incident.id,
        to: 'RECHECKING',
        actor: SYSTEM_ACTOR,
        reason: `Recheck attempt #${attempt.attempt_number} started by ${input.actor}`,
        now: input.now,
      });
    }
  }
  return attempt;
}

export interface DecisionInput {
  attemptId: string;
  decision: 'PASS' | 'FAIL';
  reason?: string;
  actor: string;
  now: Date;
}

/**
 * Records the operator's decision and keeps the incident in step.
 *
 * FAIL always creates or updates the single open incident for the check
 * (sec. 4 "Failed verification"). A PASS on a recheck advances the incident to
 * READY_TO_RESOLVE - and stops there.
 */
export function recordDecision(db: DatabaseSync, input: DecisionInput): AttemptRow {
  const attempt = attest(db, input);
  const check = checkInfo(db, attempt.check_id);
  if (!check) return attempt;

  const incident = openIncidentForCheck(db, attempt.check_id);

  if (input.decision === 'FAIL') {
    const raised = raiseOrAttachIncident(db, {
      checkId: attempt.check_id,
      runId: attempt.run_id,
      severity: severityForFailure(check.required === 1),
      reason: input.reason?.trim() || `Operator-attested FAIL on "${check.label}"`,
      actor: input.actor,
      now: input.now,
    });
    // A recheck that fails again sends the incident back for action.
    if (raised.status === 'RECHECKING') {
      transitionIncident(db, {
        incidentId: raised.id,
        to: 'ACTION_REQUIRED',
        actor: SYSTEM_ACTOR,
        reason: `Recheck attempt #${attempt.attempt_number} recorded FAIL`,
        now: input.now,
      });
    }
  } else if (incident?.status === 'RECHECKING') {
    transitionIncident(db, {
      incidentId: incident.id,
      to: 'READY_TO_RESOLVE',
      actor: SYSTEM_ACTOR,
      reason: `Recheck attempt #${attempt.attempt_number} recorded operator-attested PASS; awaiting human resolution`,
      now: input.now,
    });
  }

  return getAttempt(db, attempt.id);
}

export function cancelCheckAttempt(
  db: DatabaseSync,
  attemptId: string,
  actor: string,
  now: Date,
): AttemptRow {
  const attempt = cancelAttempt(db, attemptId, actor, now);
  const incident = openIncidentForCheck(db, attempt.check_id);
  if (incident?.status === 'RECHECKING') {
    transitionIncident(db, {
      incidentId: incident.id,
      to: 'ACTION_REQUIRED',
      actor: SYSTEM_ACTOR,
      reason: 'Recheck attempt was cancelled',
      now,
    });
  }
  return attempt;
}

/**
 * Binds the earliest eligible, unclaimed session in the attempt's window.
 *
 * Earliest rather than latest so the choice is deterministic and a later
 * session in the same window stays available to another check on the same
 * device (D-028). Every sec. 8 rule is re-checked inside `claimEvidence`.
 *
 * Returns the claimed ring_event id, or null when nothing qualifies yet - which
 * is "not yet observed", never negative evidence.
 */
export function autoClaimEvidence(
  db: DatabaseSync,
  attemptId: string,
  actor: string,
  now: Date,
): string | null {
  const attempt = getAttempt(db, attemptId);
  if (attempt.status !== 'IN_PROGRESS' || attempt.ring_event_id) return attempt.ring_event_id;

  const window = eligibleWindow(attempt);
  if (!window) return null;

  const device = row<{ device_id: string | null }>(
    db,
    'SELECT device_id FROM verification_check WHERE id = ?',
    attempt.check_id,
  );
  if (!device?.device_id) return null;

  const candidates = rows<{ id: string }>(
    db,
    `SELECT e.id FROM ring_event e
       LEFT JOIN ring_evidence_claim c ON c.ring_event_id = e.id
      WHERE e.device_id = ? AND e.event_type = 'on_demand' AND e.is_ambiguous = 0
        AND c.id IS NULL AND e.start_at >= ? AND e.start_at <= ?
      ORDER BY e.start_at ASC`,
    device.device_id,
    window.start.toISOString(),
    window.end.toISOString(),
  );

  const first = candidates[0];
  if (!first) return null;
  claimEvidence(db, { attemptId, ringEventId: first.id, actor, now });
  return first.id;
}

/**
 * Raises a BLOCKER coverage incident for each confirmed blocker (sec. 4
 * "Coverage failure", sec. 13 severity).
 *
 * Only confirmed blockers count - a device in UNKNOWN status, or a sync that
 * failed, produces nothing here. Idempotent: an existing open BLOCKER incident
 * on the check is left alone rather than accumulating repeat actions.
 */
export function raiseCoverageIncidents(db: DatabaseSync, runId: string, now: Date): number {
  const snapshot = buildRunSnapshot(db, runId, now);
  const verdict = deriveReadiness(snapshot);
  let raised = 0;

  for (const reason of verdict.reasons) {
    if (reason.code !== 'REQUIRED_DEVICE_UNAVAILABLE' && reason.code !== 'COVERED_WINDOW_NO_SESSION') {
      continue;
    }
    if (!reason.checkId) continue;

    const existing = openIncidentForCheck(db, reason.checkId);
    if (existing?.severity === 'BLOCKER') continue;

    raiseOrAttachIncident(db, {
      checkId: reason.checkId,
      runId,
      severity: 'BLOCKER',
      reason: reason.message,
      actor: SYSTEM_ACTOR,
      now,
    });
    raised += 1;
  }
  return raised;
}

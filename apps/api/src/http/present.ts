import type { DatabaseSync } from 'node:sqlite';
import { eligibleWindow, type AttemptRow } from '../domain/attempts.js';
import { readiness } from '../domain/runs.js';
import { allowedTransitions } from '../domain/incidents.js';
import { nextActions } from '../ai/nextActions.js';
import type { IncidentStatus } from '../domain/types.js';
import { DomainError, ERR } from '../domain/errors.js';
import { row, rows } from '../db/query.js';
import type { ReadinessResult } from '../domain/readiness.js';

/**
 * Read models for the UI.
 *
 * Wording lives here, server-side, so the evidence-honesty rules (spec sec. 1,
 * 5) are enforced in one tested place rather than re-implemented per component.
 * The phrase for an on_demand record is fixed: "Ring session observed during
 * this check window". Nothing here may say person/motion detected, clear, or safe.
 */

export const EVIDENCE_LABEL = 'Ring session observed during this check window';

/** What the evidence does and does not establish (spec sec. 5), shown with every card. */
export const EVIDENCE_LIMITS = [
  'Does not show who started the session.',
  'Does not show what the operator saw.',
  'Does not establish that the area was clear.',
  'The operator attestation is the business decision.',
] as const;

export interface EvidenceView {
  label: typeof EVIDENCE_LABEL;
  /** Last 8 characters only - enough to cross-reference, not a full provider id. */
  providerEventRef: string;
  sessionStartAt: string;
  sessionEndAt: string | null;
  isSimulated: boolean;
  claimedAt: string;
  limits: readonly string[];
}

export interface AttemptView {
  id: string;
  attemptNumber: number;
  status: string;
  /** Operator-facing status wording. OVERRIDDEN is never rendered as PASS. */
  statusLabel: string;
  reason: string | null;
  armedAt: string | null;
  eligibleStart: string | null;
  eligibleEnd: string | null;
  windowSeconds: number | null;
  attestedBy: string | null;
  attestedAt: string | null;
  createdAt: string;
  supersedesAttemptId: string | null;
  override: { reason: string; approvedBy: string; approvedAt: string } | null;
  evidence: EvidenceView | null;
}

export interface IncidentView {
  id: string;
  checkId: string;
  checkLabel: string;
  severity: string;
  status: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  dismissedReason: string | null;
  allowedTransitions: readonly string[];
  actions: { action: string; reason: string | null; actor: string; createdAt: string }[];
}

export interface CheckView {
  id: string;
  label: string;
  requirementType: 'RING_REQUIRED' | 'NON_RING';
  required: boolean;
  sessionWindowSeconds: number;
  device: { id: string; label: string; status: string; lastStatusAt: string | null } | null;
  attempts: AttemptView[];
  latestAttempt: AttemptView | null;
  openIncidentId: string | null;
}

export interface RunView {
  id: string;
  templateName: string;
  triggerType: string;
  dataMode: 'LIVE' | 'RECORDED_DEMO';
  /** Exact banner text required by spec sec. 19 for a recorded run. */
  dataModeLabel: string;
  captureDate: string | null;
  startedAt: string | null;
  approvedAt: string | null;
  approvalActor: string | null;
  cancelledAt: string | null;
  readiness: ReadinessResult;
  checks: CheckView[];
  incidents: IncidentView[];
  /** "What should I do next?" - mapped deterministically from readiness. */
  nextActions: string[];
}

const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: 'Awaiting operator decision',
  PASS: 'Operator-attested PASS',
  FAIL: 'Operator-attested FAIL',
  OVERRIDDEN: 'OVERRIDDEN by approver',
  CANCELLED: 'Cancelled',
};

function shortRef(providerId: string): string {
  return `…${providerId.slice(-8)}`;
}

function evidenceFor(db: DatabaseSync, attemptId: string): EvidenceView | null {
  const found = row<{
    provider_event_id: string;
    start_at: string;
    end_at: string | null;
    is_simulated: number;
    claimed_at: string;
  }>(
    db,
    `SELECT e.provider_event_id, e.start_at, e.end_at, e.is_simulated, c.claimed_at
       FROM ring_evidence_claim c JOIN ring_event e ON e.id = c.ring_event_id
      WHERE c.attempt_id = ?`,
    attemptId,
  );
  if (!found) return null;
  return {
    label: EVIDENCE_LABEL,
    providerEventRef: shortRef(found.provider_event_id),
    sessionStartAt: found.start_at,
    sessionEndAt: found.end_at,
    isSimulated: found.is_simulated === 1,
    claimedAt: found.claimed_at,
    limits: EVIDENCE_LIMITS,
  };
}

function presentAttempt(db: DatabaseSync, attempt: AttemptRow): AttemptView {
  const window = eligibleWindow(attempt);
  return {
    id: attempt.id,
    attemptNumber: attempt.attempt_number,
    status: attempt.status,
    statusLabel: STATUS_LABELS[attempt.status] ?? attempt.status,
    reason: attempt.reason,
    armedAt: attempt.armed_at,
    eligibleStart: window?.start.toISOString() ?? null,
    eligibleEnd: window?.end.toISOString() ?? null,
    windowSeconds: attempt.window_seconds,
    attestedBy: attempt.attested_by,
    attestedAt: attempt.attested_at,
    createdAt: attempt.created_at,
    supersedesAttemptId: attempt.supersedes_attempt_id,
    override:
      attempt.status === 'OVERRIDDEN' && attempt.override_reason && attempt.approved_by && attempt.approved_at
        ? { reason: attempt.override_reason, approvedBy: attempt.approved_by, approvedAt: attempt.approved_at }
        : null,
    evidence: evidenceFor(db, attempt.id),
  };
}

export function presentIncidents(db: DatabaseSync, where: { runId?: string; openOnly?: boolean }): IncidentView[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (where.runId) {
    clauses.push('i.run_id = ?');
    params.push(where.runId);
  }
  if (where.openOnly) clauses.push("i.status NOT IN ('RESOLVED', 'DISMISSED')");
  const sql = `SELECT i.*, c.label AS check_label FROM incident i
                 JOIN verification_check c ON c.id = i.check_id
                ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
                ORDER BY i.created_at DESC`;

  return rows<{
    id: string;
    check_id: string;
    check_label: string;
    severity: string;
    status: string;
    reason: string;
    created_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    dismissed_reason: string | null;
  }>(db, sql, ...params).map((incident) => ({
    id: incident.id,
    checkId: incident.check_id,
    checkLabel: incident.check_label,
    severity: incident.severity,
    status: incident.status,
    reason: incident.reason,
    createdAt: incident.created_at,
    resolvedAt: incident.resolved_at,
    resolvedBy: incident.resolved_by,
    dismissedReason: incident.dismissed_reason,
    allowedTransitions: allowedTransitions(incident.status as IncidentStatus),
    actions: rows<{ action: string; reason: string | null; actor: string; created_at: string }>(
      db,
      'SELECT action, reason, actor, created_at FROM incident_action WHERE incident_id = ? ORDER BY created_at, rowid',
      incident.id,
    ).map((a) => ({ action: a.action, reason: a.reason, actor: a.actor, createdAt: a.created_at })),
  }));
}

export function presentRun(db: DatabaseSync, runId: string, now: Date): RunView {
  const run = row<{
    id: string;
    template_id: string;
    started_at: string | null;
    approved_at: string | null;
    approval_actor_id: string | null;
    cancelled_at: string | null;
    data_mode: 'LIVE' | 'RECORDED_DEMO';
    capture_date: string | null;
    name: string;
    trigger_type: string;
  }>(
    db,
    `SELECT r.*, t.name, t.trigger_type FROM verification_run r
       JOIN verification_template t ON t.id = r.template_id WHERE r.id = ?`,
    runId,
  );
  if (!run) throw new DomainError(ERR.NOT_FOUND, `No run ${runId}`);

  const checkRows = rows<{
    id: string;
    label: string;
    requirement_type: 'RING_REQUIRED' | 'NON_RING';
    required: number;
    session_window_seconds: number;
    device_id: string | null;
    device_label: string | null;
    device_status: string | null;
    device_last_status_at: string | null;
  }>(
    db,
    `SELECT c.id, c.label, c.requirement_type, c.required, c.session_window_seconds, c.device_id,
            d.label AS device_label, d.status AS device_status, d.last_status_at AS device_last_status_at
       FROM verification_check c LEFT JOIN device d ON d.id = c.device_id
      WHERE c.template_id = ? ORDER BY c.sort_order, c.id`,
    run.template_id,
  );

  const openIncidents = new Map(
    rows<{ id: string; check_id: string }>(
      db,
      "SELECT id, check_id FROM incident WHERE status NOT IN ('RESOLVED', 'DISMISSED')",
    ).map((i) => [i.check_id, i.id]),
  );

  const checks: CheckView[] = checkRows.map((check) => {
    const attempts = rows<AttemptRow>(
      db,
      'SELECT * FROM verification_attempt WHERE run_id = ? AND check_id = ? ORDER BY attempt_number',
      runId,
      check.id,
    ).map((attempt) => presentAttempt(db, attempt));
    const latest = [...attempts].reverse().find((a) => a.status !== 'CANCELLED') ?? null;

    return {
      id: check.id,
      label: check.label,
      requirementType: check.requirement_type,
      required: check.required === 1,
      sessionWindowSeconds: check.session_window_seconds,
      device:
        check.device_id && check.device_label
          ? {
              id: check.device_id,
              label: check.device_label,
              status: check.device_status ?? 'UNKNOWN',
              lastStatusAt: check.device_last_status_at,
            }
          : null,
      attempts,
      latestAttempt: latest,
      openIncidentId: openIncidents.get(check.id) ?? null,
    };
  });

  const view: RunView = {
    id: run.id,
    templateName: run.name,
    triggerType: run.trigger_type,
    dataMode: run.data_mode,
    dataModeLabel:
      run.data_mode === 'RECORDED_DEMO'
        ? `RECORDED DEMO - Ring Playground capture: ${run.capture_date}`
        : 'LIVE PLAYGROUND',
    captureDate: run.capture_date,
    startedAt: run.started_at,
    approvedAt: run.approved_at,
    approvalActor: run.approval_actor_id,
    cancelledAt: run.cancelled_at,
    readiness: readiness(db, runId, now),
    checks,
    incidents: presentIncidents(db, { runId }),
    nextActions: [],
  };
  // Deterministic, configured actions (spec sec. 17) - no model involved.
  return { ...view, nextActions: nextActions(view).map((a) => a.action) };
}

export interface RunSummary {
  id: string;
  templateName: string;
  triggerType: string;
  dataMode: string;
  dataModeLabel: string;
  startedAt: string | null;
  status: string;
  integrationState: string;
}

export function listRuns(db: DatabaseSync, now: Date): RunSummary[] {
  return rows<{
    id: string;
    name: string;
    trigger_type: string;
    data_mode: string;
    capture_date: string | null;
    started_at: string | null;
  }>(
    db,
    `SELECT r.id, t.name, t.trigger_type, r.data_mode, r.capture_date, r.started_at
       FROM verification_run r JOIN verification_template t ON t.id = r.template_id
      ORDER BY COALESCE(r.started_at, '9999') DESC, r.rowid DESC`,
  ).map((run) => {
    const verdict = readiness(db, run.id, now);
    return {
      id: run.id,
      templateName: run.name,
      triggerType: run.trigger_type,
      dataMode: run.data_mode,
      dataModeLabel:
        run.data_mode === 'RECORDED_DEMO'
          ? `RECORDED DEMO - Ring Playground capture: ${run.capture_date}`
          : 'LIVE PLAYGROUND',
      startedAt: run.started_at,
      status: verdict.status,
      integrationState: verdict.integrationState,
    };
  });
}

export function listAudit(db: DatabaseSync, runId: string) {
  // Audit entries reference attempts, incidents and the run itself.
  return rows<{
    id: string;
    actor: string;
    action: string;
    entity_type: string;
    entity_id: string;
    timestamp: string;
    metadata: string | null;
  }>(
    db,
    `SELECT a.* FROM audit_log a
      WHERE (a.entity_type = 'verification_run' AND a.entity_id = ?)
         OR (a.entity_type = 'verification_attempt'
             AND a.entity_id IN (SELECT id FROM verification_attempt WHERE run_id = ?))
         OR (a.entity_type = 'incident' AND a.entity_id IN (SELECT id FROM incident WHERE run_id = ?))
      ORDER BY a.timestamp, a.rowid`,
    runId,
    runId,
    runId,
  ).map((entry) => ({
    id: entry.id,
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    timestamp: entry.timestamp,
    metadata: entry.metadata ? (JSON.parse(entry.metadata) as Record<string, unknown>) : null,
  }));
}

import type {
  AttemptStatus,
  BlockerCause,
  IncidentSeverity,
  IntegrationState,
  RequirementType,
  RunStatus,
} from './types.js';
import { BLOCKING_SEVERITIES } from './types.js';

/**
 * Deterministic readiness (spec v7 sec. 11).
 *
 * A pure function over a snapshot: no clock, no database, no AI. The AI copilot
 * explains this result, it never produces one (sec. 17).
 */

export interface AttemptSnapshot {
  readonly status: AttemptStatus;
  /** True only when a qualifying, claimed, non-ambiguous on_demand event is bound. */
  readonly hasQualifyingRingEvidence: boolean;
}

export interface CheckSnapshot {
  readonly checkId: string;
  readonly label: string;
  readonly required: boolean;
  readonly requirementType: RequirementType;
  /** Latest non-cancelled attempt, or null when none has begun (sec. 7). */
  readonly latestAttempt: AttemptSnapshot | null;
  /** Confirmed unavailable. An UNKNOWN device status must not set this. */
  readonly deviceUnavailable: boolean;
  /** Window expired AND a sync covered the whole window AND nothing qualified. */
  readonly coveredWindowExpiredWithoutSession: boolean;
}

export interface IncidentSnapshot {
  readonly incidentId: string;
  readonly checkId: string;
  readonly severity: IncidentSeverity;
}

export interface RunSnapshot {
  readonly cancelledAt: string | null;
  readonly approvedAt: string | null;
  readonly integrationState: IntegrationState;
  readonly checks: readonly CheckSnapshot[];
  /** Incidents still open, in any pre-resolved state. */
  readonly openIncidents: readonly IncidentSnapshot[];
}

export interface ReadinessReason {
  readonly code:
    | 'RUN_CANCELLED'
    | 'RUN_APPROVED'
    | 'NO_ATTEMPTS_STARTED'
    | 'REQUIRED_CHECK_FAILED'
    | 'REQUIRED_DEVICE_UNAVAILABLE'
    | 'COVERED_WINDOW_NO_SESSION'
    | 'BLOCKING_INCIDENT_OPEN'
    | 'INTEGRATION_RECONNECT_REQUIRED'
    | 'REQUIRED_CHECK_INCOMPLETE'
    | 'RING_EVIDENCE_MISSING'
    | 'ALL_REQUIRED_CHECKS_SATISFIED';
  readonly checkId?: string;
  readonly incidentId?: string;
  /** Operator-facing wording. Must never upgrade evidence into a safety claim. */
  readonly message: string;
}

export interface ReadinessResult {
  readonly status: RunStatus;
  readonly integrationState: IntegrationState;
  /** Ordered, deterministic explanation for "Why are we not ready?" (sec. 17). */
  readonly reasons: readonly ReadinessReason[];
}

/** A latest attempt that satisfies its check without an override. */
function isSatisfyingPass(check: CheckSnapshot): boolean {
  const attempt = check.latestAttempt;
  if (attempt?.status !== 'PASS') return false;
  // Ring evidence is required for PASS only on RING_REQUIRED checks (sec. 12).
  return check.requirementType !== 'RING_REQUIRED' || attempt.hasQualifyingRingEvidence;
}

function isSatisfied(check: CheckSnapshot): boolean {
  // An approved override satisfies the gate but is never displayed as PASS (sec. 13).
  return isSatisfyingPass(check) || check.latestAttempt?.status === 'OVERRIDDEN';
}

function blockerCause(check: CheckSnapshot): BlockerCause | null {
  if (check.deviceUnavailable) return 'DEVICE_UNAVAILABLE';
  if (check.coveredWindowExpiredWithoutSession) return 'COVERED_WINDOW_NO_SESSION';
  return null;
}

export function deriveReadiness(run: RunSnapshot): ReadinessResult {
  const { integrationState } = run;
  const reasons: ReadinessReason[] = [];

  // Terminal states first.
  if (run.cancelledAt) {
    return {
      status: 'CANCELLED',
      integrationState,
      reasons: [{ code: 'RUN_CANCELLED', message: 'This run was cancelled.' }],
    };
  }

  // 1. READY - explicit final approval has occurred.
  if (run.approvedAt) {
    return {
      status: 'READY',
      integrationState,
      reasons: [{ code: 'RUN_APPROVED', message: 'A human approver recorded final approval.' }],
    };
  }

  const requiredChecks = run.checks.filter((c) => c.required);

  // 6. NOT_STARTED - no attempt has begun on any check.
  if (run.checks.every((c) => c.latestAttempt === null)) {
    return {
      status: 'NOT_STARTED',
      integrationState,
      reasons: [{ code: 'NO_ATTEMPTS_STARTED', message: 'No check has been started yet.' }],
    };
  }

  // 3. NOT_READY - any required check's latest attempt is FAIL. This rule is immediate:
  // it outranks every blocker, and dismissing an incident does not clear it (sec. 13).
  const failed = requiredChecks.filter((c) => c.latestAttempt?.status === 'FAIL');
  if (failed.length > 0) {
    return {
      status: 'NOT_READY',
      integrationState,
      reasons: failed.map((c) => ({
        code: 'REQUIRED_CHECK_FAILED' as const,
        checkId: c.checkId,
        message: `Operator-attested FAIL on "${c.label}". Clear it with a replacement PASS attempt or an approved override.`,
      })),
    };
  }

  // 4. BLOCKED - no required FAIL, but a confirmed blocker exists.
  // Integration trouble is deliberately absent from this list (sec. 10).
  for (const check of requiredChecks) {
    const cause = blockerCause(check);
    if (cause === 'DEVICE_UNAVAILABLE') {
      reasons.push({
        code: 'REQUIRED_DEVICE_UNAVAILABLE',
        checkId: check.checkId,
        message: `The Ring device required for "${check.label}" is confirmed unavailable.`,
      });
    } else if (cause === 'COVERED_WINDOW_NO_SESSION') {
      reasons.push({
        code: 'COVERED_WINDOW_NO_SESSION',
        checkId: check.checkId,
        message: `The check window for "${check.label}" expired and a completed history sync observed no qualifying Ring session. This is negative evidence about the check, not evidence about the site.`,
      });
    }
  }
  if (reasons.length > 0) {
    return { status: 'BLOCKED', integrationState, reasons };
  }

  // 2. READY_TO_APPROVE - every required check satisfied, every RING_REQUIRED PASS
  // carries qualifying evidence, no BLOCKER/HIGH incident open, integration HEALTHY.
  const unsatisfied = requiredChecks.filter((c) => !isSatisfied(c));
  const blockingIncidents = run.openIncidents.filter((i) =>
    BLOCKING_SEVERITIES.includes(i.severity),
  );

  for (const check of unsatisfied) {
    const attempt = check.latestAttempt;
    if (attempt?.status === 'PASS' && check.requirementType === 'RING_REQUIRED') {
      // A PASS was recorded but no qualifying event is bound: the gate is not met.
      reasons.push({
        code: 'RING_EVIDENCE_MISSING',
        checkId: check.checkId,
        message: `"${check.label}" requires a Ring session observed during its check window before it can count as passed.`,
      });
    } else {
      reasons.push({
        code: 'REQUIRED_CHECK_INCOMPLETE',
        checkId: check.checkId,
        message: `"${check.label}" has no recorded operator decision yet.`,
      });
    }
  }
  for (const incident of blockingIncidents) {
    reasons.push({
      code: 'BLOCKING_INCIDENT_OPEN',
      checkId: incident.checkId,
      incidentId: incident.incidentId,
      message: `A ${incident.severity} incident is still open and must be resolved or dismissed by a person.`,
    });
  }
  if (integrationState === 'RECONNECT_REQUIRED') {
    reasons.push({
      code: 'INTEGRATION_RECONNECT_REQUIRED',
      message:
        'Ring sync unavailable - reconnect needed. This is an integration problem, not evidence about the site.',
    });
  }

  if (reasons.length === 0) {
    return {
      status: 'READY_TO_APPROVE',
      integrationState,
      reasons: [
        {
          code: 'ALL_REQUIRED_CHECKS_SATISFIED',
          message: 'Every required check has an operator decision or an approved override.',
        },
      ],
    };
  }

  // 5. IN_PROGRESS - otherwise. The reasons collected above say what remains.
  return { status: 'IN_PROGRESS', integrationState, reasons };
}

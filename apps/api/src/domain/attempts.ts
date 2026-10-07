import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { DomainError, ERR } from './errors.js';
import { writeAudit } from './audit.js';

/**
 * Verification attempts (spec v7 sec. 7, 8, 12).
 *
 * Every execution of a check is a new immutable row. A recheck never overwrites
 * the attempt it supersedes - the database triggers in schema.sql enforce that
 * even if application code gets it wrong.
 */

export interface AttemptRow {
  id: string;
  run_id: string;
  check_id: string;
  attempt_number: number;
  status: string;
  reason: string | null;
  ring_event_id: string | null;
  armed_at: string | null;
  window_seconds: number | null;
  skew_seconds: number | null;
  attested_by: string | null;
  attested_at: string | null;
  created_at: string;
  supersedes_attempt_id: string | null;
  override_type: string | null;
  override_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

interface CheckRow {
  id: string;
  requirement_type: string;
  device_id: string | null;
  label: string;
  session_window_seconds: number;
}

function iso(at: Date): string {
  return at.toISOString();
}

function requireRunOpen(db: DatabaseSync, runId: string): void {
  const run = db
    .prepare('SELECT approved_at, cancelled_at FROM verification_run WHERE id = ?')
    .get(runId) as { approved_at: string | null; cancelled_at: string | null } | undefined;
  if (!run) throw new DomainError(ERR.NOT_FOUND, `No run ${runId}`);
  if (run.cancelled_at) throw new DomainError(ERR.RUN_TERMINAL, 'This run was cancelled.');
  if (run.approved_at) throw new DomainError(ERR.RUN_TERMINAL, 'This run is already approved.');
}

function requireCheck(db: DatabaseSync, checkId: string): CheckRow {
  const check = db
    .prepare(
      'SELECT id, requirement_type, device_id, label, session_window_seconds FROM verification_check WHERE id = ?',
    )
    .get(checkId) as CheckRow | undefined;
  if (!check) throw new DomainError(ERR.NOT_FOUND, `No check ${checkId}`);
  return check;
}

export function getAttempt(db: DatabaseSync, attemptId: string): AttemptRow {
  const row = db
    .prepare('SELECT * FROM verification_attempt WHERE id = ?')
    .get(attemptId) as AttemptRow | undefined;
  if (!row) throw new DomainError(ERR.NOT_FOUND, `No attempt ${attemptId}`);
  return row;
}

/** Latest non-cancelled attempt for a check within a run (sec. 7 latest-attempt rule). */
export function latestAttempt(
  db: DatabaseSync,
  runId: string,
  checkId: string,
): AttemptRow | undefined {
  return db
    .prepare(
      `SELECT * FROM verification_attempt
        WHERE run_id = ? AND check_id = ? AND status <> 'CANCELLED'
        ORDER BY attempt_number DESC LIMIT 1`,
    )
    .get(runId, checkId) as AttemptRow | undefined;
}

export interface StartAttemptInput {
  runId: string;
  checkId: string;
  actor: string;
  now: Date;
  /** Overrides the check's configured window - used for the shorter demo window. */
  windowSeconds?: number;
  skewSeconds: number;
}

/**
 * Arms a new attempt. For a Ring-backed check this records armed_at as the
 * ActivityOps server timestamp at the moment the operator explicitly starts the
 * Ring step (sec. 8.1) - never inferred from page render time.
 */
export function startAttempt(db: DatabaseSync, input: StartAttemptInput): AttemptRow {
  requireRunOpen(db, input.runId);
  const check = requireCheck(db, input.checkId);

  const open = db
    .prepare(
      `SELECT id FROM verification_attempt
        WHERE run_id = ? AND check_id = ? AND status = 'IN_PROGRESS'`,
    )
    .get(input.runId, input.checkId) as { id: string } | undefined;
  if (open) {
    throw new DomainError(
      ERR.ATTEMPT_ALREADY_OPEN,
      'This check already has an attempt in progress. Record a decision or cancel it first.',
    );
  }

  const previous = latestAttempt(db, input.runId, input.checkId);
  const maxNumber = db
    .prepare(
      'SELECT COALESCE(MAX(attempt_number), 0) AS n FROM verification_attempt WHERE run_id = ? AND check_id = ?',
    )
    .get(input.runId, input.checkId) as { n: number };

  const isRing = check.requirement_type === 'RING_REQUIRED';
  const windowSeconds = input.windowSeconds ?? check.session_window_seconds;
  const id = randomUUID();

  db.prepare(
    `INSERT INTO verification_attempt
       (id, run_id, check_id, attempt_number, status, armed_at, window_seconds, skew_seconds,
        created_at, supersedes_attempt_id)
     VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.runId,
    input.checkId,
    maxNumber.n + 1,
    isRing ? iso(input.now) : null,
    isRing ? windowSeconds : null,
    isRing ? input.skewSeconds : null,
    iso(input.now),
    previous?.id ?? null,
  );

  db.prepare('UPDATE verification_run SET started_at = COALESCE(started_at, ?) WHERE id = ?').run(
    iso(input.now),
    input.runId,
  );

  writeAudit(db, {
    actor: input.actor,
    action: previous ? 'RECHECK' : 'START_ATTEMPT',
    entityType: 'verification_attempt',
    entityId: id,
    at: input.now,
    metadata: { checkId: input.checkId, attemptNumber: maxNumber.n + 1 },
  });

  return getAttempt(db, id);
}

/** Eligible window for an armed Ring-backed attempt (sec. 8.4). */
export function eligibleWindow(attempt: AttemptRow): { start: Date; end: Date } | null {
  if (!attempt.armed_at || attempt.window_seconds === null || attempt.skew_seconds === null) {
    return null;
  }
  const armed = new Date(attempt.armed_at).getTime();
  return {
    start: new Date(armed - attempt.skew_seconds * 1000),
    end: new Date(armed + attempt.window_seconds * 1000),
  };
}

export interface ClaimEvidenceInput {
  attemptId: string;
  ringEventId: string;
  actor: string;
  now: Date;
}

/**
 * Binds one provider event to one attempt (sec. 8.6-8.9).
 *
 * Every rule is re-checked here even though the sync already filtered: the claim
 * is the point where evidence becomes load-bearing, so it does not trust callers.
 */
export function claimEvidence(db: DatabaseSync, input: ClaimEvidenceInput): void {
  const attempt = getAttempt(db, input.attemptId);
  if (attempt.status !== 'IN_PROGRESS') {
    throw new DomainError(ERR.ATTEMPT_NOT_OPEN, 'Evidence can only be bound to an open attempt.');
  }
  const check = requireCheck(db, attempt.check_id);
  const event = db
    .prepare(
      'SELECT id, device_id, event_type, start_at, is_ambiguous FROM ring_event WHERE id = ?',
    )
    .get(input.ringEventId) as
    | { id: string; device_id: string; event_type: string; start_at: string; is_ambiguous: number }
    | undefined;
  if (!event) throw new DomainError(ERR.NOT_FOUND, `No ring event ${input.ringEventId}`);

  // sec. 8.6 - exact device, no cross-device matching.
  if (event.device_id !== check.device_id) {
    throw new DomainError(
      ERR.EVENT_DEVICE_MISMATCH,
      'That Ring session belongs to a different device than this check requires.',
    );
  }
  // sec. 8.7 - client-side type binding, mandatory regardless of server filtering.
  if (event.event_type !== 'on_demand') {
    throw new DomainError(ERR.EVENT_TYPE_NOT_ELIGIBLE, 'Only on_demand session records qualify.');
  }
  // sec. 8.9 - media-correlated events are quarantined.
  if (event.is_ambiguous) {
    throw new DomainError(
      ERR.EVENT_AMBIGUOUS,
      'That record is ambiguous (it may have been produced by a media request) and cannot satisfy the Ring session gate.',
    );
  }
  // sec. 8.4 - window.
  const window = eligibleWindow(attempt);
  if (!window) {
    throw new DomainError(ERR.EVENT_OUTSIDE_WINDOW, 'This attempt has no armed Ring window.');
  }
  const startedAt = new Date(event.start_at).getTime();
  if (startedAt < window.start.getTime() || startedAt > window.end.getTime()) {
    throw new DomainError(
      ERR.EVENT_OUTSIDE_WINDOW,
      'That Ring session did not start inside this check window.',
    );
  }

  // sec. 8.8 - one-to-one claim. The UNIQUE index is the real guard; this
  // translates its constraint failure into a domain error.
  try {
    db.prepare(
      'INSERT INTO ring_evidence_claim (id, ring_event_id, attempt_id, claimed_at) VALUES (?, ?, ?, ?)',
    ).run(randomUUID(), event.id, attempt.id, iso(input.now));
  } catch (cause) {
    if (String(cause).includes('UNIQUE')) {
      throw new DomainError(
        ERR.EVENT_ALREADY_CLAIMED,
        'That Ring session has already been claimed by another verification attempt.',
      );
    }
    throw cause;
  }

  db.prepare('UPDATE verification_attempt SET ring_event_id = ? WHERE id = ?').run(
    event.id,
    attempt.id,
  );

  writeAudit(db, {
    actor: input.actor,
    action: 'CLAIM_EVIDENCE',
    entityType: 'verification_attempt',
    entityId: attempt.id,
    at: input.now,
    metadata: { ringEventId: event.id },
  });
}

/** True when the attempt has a claimed, qualifying session bound to it. */
export function hasQualifyingEvidence(db: DatabaseSync, attemptId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM ring_evidence_claim c
         JOIN ring_event e ON e.id = c.ring_event_id
        WHERE c.attempt_id = ? AND e.event_type = 'on_demand' AND e.is_ambiguous = 0`,
    )
    .get(attemptId) as { ok: number } | undefined;
  return row !== undefined;
}

export interface AttestInput {
  attemptId: string;
  decision: 'PASS' | 'FAIL';
  reason?: string;
  actor: string;
  now: Date;
}

/**
 * Records the operator's decision (sec. 12).
 *
 * FAIL is always allowed, including when Ring evidence was delayed or never
 * arrived - an operator must be able to report a real-world failure. PASS on a
 * RING_REQUIRED check is refused without qualifying claimed evidence.
 */
export function attest(db: DatabaseSync, input: AttestInput): AttemptRow {
  const attempt = getAttempt(db, input.attemptId);
  if (attempt.status !== 'IN_PROGRESS') {
    throw new DomainError(
      ERR.ATTEMPT_NOT_OPEN,
      'This attempt already has a recorded decision. Start a recheck instead.',
    );
  }
  const check = requireCheck(db, attempt.check_id);

  if (
    input.decision === 'PASS' &&
    check.requirement_type === 'RING_REQUIRED' &&
    !hasQualifyingEvidence(db, attempt.id)
  ) {
    throw new DomainError(
      ERR.RING_EVIDENCE_REQUIRED,
      'This check can only be passed once a Ring session has been observed during its check window.',
    );
  }

  db.prepare(
    'UPDATE verification_attempt SET status = ?, reason = ?, attested_by = ?, attested_at = ? WHERE id = ?',
  ).run(input.decision, input.reason ?? null, input.actor, iso(input.now), attempt.id);

  writeAudit(db, {
    actor: input.actor,
    action: input.decision,
    entityType: 'verification_attempt',
    entityId: attempt.id,
    at: input.now,
    metadata: { checkId: attempt.check_id },
  });

  return getAttempt(db, attempt.id);
}

export function cancelAttempt(
  db: DatabaseSync,
  attemptId: string,
  actor: string,
  now: Date,
): AttemptRow {
  const attempt = getAttempt(db, attemptId);
  if (attempt.status !== 'IN_PROGRESS') {
    throw new DomainError(ERR.ATTEMPT_NOT_OPEN, 'Only an open attempt can be cancelled.');
  }
  db.prepare('UPDATE verification_attempt SET status = ?, attested_at = ? WHERE id = ?').run(
    'CANCELLED',
    iso(now),
    attemptId,
  );
  writeAudit(db, {
    actor,
    action: 'CANCEL_ATTEMPT',
    entityType: 'verification_attempt',
    entityId: attemptId,
    at: now,
  });
  return getAttempt(db, attemptId);
}

export interface OverrideInput {
  runId: string;
  checkId: string;
  approver: string;
  reason: string;
  now: Date;
}

/**
 * Manager override (sec. 13).
 *
 * Recorded as a NEW attempt with status OVERRIDDEN that supersedes the failure.
 * It is never written as PASS and never rewrites the attempt it supersedes, so
 * the audit history still shows the original FAIL.
 */
export function recordOverride(db: DatabaseSync, input: OverrideInput): AttemptRow {
  requireRunOpen(db, input.runId);
  requireCheck(db, input.checkId);
  if (!input.reason?.trim()) {
    throw new DomainError(ERR.OVERRIDE_REASON_REQUIRED, 'An override requires a written reason.');
  }

  const previous = latestAttempt(db, input.runId, input.checkId);
  const maxNumber = db
    .prepare(
      'SELECT COALESCE(MAX(attempt_number), 0) AS n FROM verification_attempt WHERE run_id = ? AND check_id = ?',
    )
    .get(input.runId, input.checkId) as { n: number };

  const id = randomUUID();
  db.prepare(
    `INSERT INTO verification_attempt
       (id, run_id, check_id, attempt_number, status, created_at, supersedes_attempt_id,
        override_type, override_reason, approved_by, approved_at, attested_by, attested_at)
     VALUES (?, ?, ?, ?, 'OVERRIDDEN', ?, ?, 'MANAGER_OVERRIDE', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.runId,
    input.checkId,
    maxNumber.n + 1,
    iso(input.now),
    previous?.id ?? null,
    input.reason,
    input.approver,
    iso(input.now),
    input.approver,
    iso(input.now),
  );

  writeAudit(db, {
    actor: input.approver,
    action: 'OVERRIDE',
    entityType: 'verification_attempt',
    entityId: id,
    at: input.now,
    metadata: { checkId: input.checkId, supersedes: previous?.id ?? null },
  });

  return getAttempt(db, id);
}

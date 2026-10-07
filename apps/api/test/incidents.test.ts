import { describe, expect, it } from 'vitest';
import { makeFixture, at, T0 } from './helpers/fixture.js';
import { attest, startAttempt } from '../src/domain/attempts.js';
import {
  openIncidentForCheck,
  raiseOrAttachIncident,
  severityForFailure,
  transitionIncident,
} from '../src/domain/incidents.js';
import { readiness, approveRun, cancelRun, setIntegrationState } from '../src/domain/runs.js';
import { ERR } from '../src/domain/errors.js';

function failCheck(fx: ReturnType<typeof makeFixture>, checkId: string, when = T0) {
  const attempt = startAttempt(fx.db, {
    runId: fx.runId,
    checkId,
    actor: 'operator@demo',
    now: when,
    skewSeconds: 30,
  });
  attest(fx.db, {
    attemptId: attempt.id,
    decision: 'FAIL',
    reason: 'Not completed',
    actor: 'operator@demo',
    now: new Date(when.getTime() + 30_000),
  });
  return raiseOrAttachIncident(fx.db, {
    checkId,
    runId: fx.runId,
    severity: severityForFailure(true),
    reason: 'Not completed',
    actor: 'operator@demo',
    now: new Date(when.getTime() + 31_000),
  });
}

describe('one open incident per check (spec sec. 13)', () => {
  it('attaches a repeat failure to the existing open incident', () => {
    const fx = makeFixture();
    const first = failCheck(fx, fx.nonRingCheckId);
    const second = raiseOrAttachIncident(fx.db, {
      checkId: fx.nonRingCheckId,
      runId: fx.runId,
      severity: 'HIGH',
      reason: 'Still not completed',
      actor: 'operator@demo',
      now: at(300),
    });

    expect(second.id).toBe(first.id);
    const count = fx.db
      .prepare('SELECT COUNT(*) AS n FROM incident WHERE check_id = ?')
      .get(fx.nonRingCheckId) as { n: number };
    expect(count.n).toBe(1);
  });

  it('escalates severity when a worse failure attaches', () => {
    const fx = makeFixture();
    const incident = raiseOrAttachIncident(fx.db, {
      checkId: fx.nonRingCheckId,
      runId: fx.runId,
      severity: 'MEDIUM',
      reason: 'Optional miss',
      actor: 'operator@demo',
      now: T0,
    });
    expect(incident.severity).toBe('MEDIUM');

    const escalated = raiseOrAttachIncident(fx.db, {
      checkId: fx.nonRingCheckId,
      runId: fx.runId,
      severity: 'BLOCKER',
      reason: 'Device confirmed unavailable',
      actor: 'system',
      now: at(60),
    });
    expect(escalated.severity).toBe('BLOCKER');
  });

  it('rejects a duplicate open incident inserted directly', () => {
    const fx = makeFixture();
    failCheck(fx, fx.nonRingCheckId);
    expect(() =>
      fx.db
        .prepare(
          "INSERT INTO incident (id, check_id, severity, status, reason, created_at) VALUES ('x', ?, 'HIGH', 'OPEN', 'dup', ?)",
        )
        .run(fx.nonRingCheckId, T0.toISOString()),
    ).toThrow(/UNIQUE/i);
  });

  it('allows a new incident once the previous one is resolved', () => {
    const fx = makeFixture();
    const incident = failCheck(fx, fx.nonRingCheckId);
    transitionIncident(fx.db, { incidentId: incident.id, to: 'RECHECKING', actor: 'operator@demo', now: at(60) });
    transitionIncident(fx.db, { incidentId: incident.id, to: 'READY_TO_RESOLVE', actor: 'operator@demo', now: at(90) });
    transitionIncident(fx.db, { incidentId: incident.id, to: 'RESOLVED', actor: 'manager@demo', now: at(120) });

    const fresh = raiseOrAttachIncident(fx.db, {
      checkId: fx.nonRingCheckId,
      runId: fx.runId,
      severity: 'HIGH',
      reason: 'Failed again later in the shift',
      actor: 'operator@demo',
      now: at(600),
    });
    expect(fresh.id).not.toBe(incident.id);
  });
});

describe('incident lifecycle transitions', () => {
  it('rejects an illegal jump straight to RESOLVED', () => {
    const fx = makeFixture();
    const incident = failCheck(fx, fx.nonRingCheckId);
    expect(() =>
      transitionIncident(fx.db, { incidentId: incident.id, to: 'RESOLVED', actor: 'manager@demo', now: at(60) }),
    ).toThrowError(expect.objectContaining({ code: ERR.INVALID_INCIDENT_TRANSITION }));
  });

  it('requires a reason to dismiss', () => {
    const fx = makeFixture();
    const incident = failCheck(fx, fx.nonRingCheckId);
    expect(() =>
      transitionIncident(fx.db, { incidentId: incident.id, to: 'DISMISSED', actor: 'manager@demo', now: at(60) }),
    ).toThrowError(expect.objectContaining({ code: ERR.INVALID_INCIDENT_TRANSITION }));
  });

  it('records a resolver on RESOLVED', () => {
    const fx = makeFixture();
    const incident = failCheck(fx, fx.nonRingCheckId);
    transitionIncident(fx.db, { incidentId: incident.id, to: 'RECHECKING', actor: 'operator@demo', now: at(60) });
    transitionIncident(fx.db, { incidentId: incident.id, to: 'READY_TO_RESOLVE', actor: 'operator@demo', now: at(90) });
    const resolved = transitionIncident(fx.db, {
      incidentId: incident.id,
      to: 'RESOLVED',
      actor: 'manager@demo',
      now: at(120),
    });
    expect(resolved.resolved_by).toBe('manager@demo');
  });

  it('writes an action trail for every transition', () => {
    const fx = makeFixture();
    const incident = failCheck(fx, fx.nonRingCheckId);
    transitionIncident(fx.db, { incidentId: incident.id, to: 'ACKNOWLEDGED', actor: 'operator@demo', now: at(60) });
    const actions = fx.db
      .prepare('SELECT action FROM incident_action WHERE incident_id = ? ORDER BY created_at')
      .all(incident.id) as { action: string }[];
    expect(actions.map((a) => a.action)).toEqual(['OPEN', 'ACKNOWLEDGED']);
  });
});

describe('dismissal deadlock rule (spec sec. 13)', () => {
  it('dismissing the incident does not clear the failed attempt', () => {
    const fx = makeFixture();
    // Satisfy the other required check so the FAIL is the only obstacle.
    const other = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.ringCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    fx.db.prepare('UPDATE verification_check SET requirement_type = ? WHERE id = ?').run(
      'NON_RING',
      fx.ringCheckId,
    );
    attest(fx.db, { attemptId: other.id, decision: 'PASS', actor: 'operator@demo', now: at(20) });

    const incident = failCheck(fx, fx.nonRingCheckId, at(60));
    expect(readiness(fx.db, fx.runId).status).toBe('NOT_READY');

    transitionIncident(fx.db, {
      incidentId: incident.id,
      to: 'DISMISSED',
      actor: 'manager@demo',
      reason: 'Duplicate report',
      now: at(200),
    });

    // The incident is gone from the open list, but the FAIL still governs readiness.
    expect(openIncidentForCheck(fx.db, fx.nonRingCheckId)).toBeUndefined();
    const result = readiness(fx.db, fx.runId);
    expect(result.status).toBe('NOT_READY');
    expect(result.reasons[0]?.code).toBe('REQUIRED_CHECK_FAILED');
  });

  it('a replacement PASS attempt clears it', () => {
    const fx = makeFixture();
    fx.db.prepare('UPDATE verification_check SET requirement_type = ? WHERE id = ?').run(
      'NON_RING',
      fx.ringCheckId,
    );
    const ring = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.ringCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    attest(fx.db, { attemptId: ring.id, decision: 'PASS', actor: 'operator@demo', now: at(20) });

    const incident = failCheck(fx, fx.nonRingCheckId, at(60));
    transitionIncident(fx.db, { incidentId: incident.id, to: 'RECHECKING', actor: 'operator@demo', now: at(120) });

    const recheck = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.nonRingCheckId,
      actor: 'operator@demo',
      now: at(150),
      skewSeconds: 30,
    });
    attest(fx.db, { attemptId: recheck.id, decision: 'PASS', actor: 'operator@demo', now: at(180) });
    transitionIncident(fx.db, { incidentId: incident.id, to: 'READY_TO_RESOLVE', actor: 'operator@demo', now: at(200) });
    transitionIncident(fx.db, { incidentId: incident.id, to: 'RESOLVED', actor: 'manager@demo', now: at(220) });

    expect(readiness(fx.db, fx.runId).status).toBe('READY_TO_APPROVE');
  });
});

describe('run approval and cancellation (spec sec. 11)', () => {
  it('refuses approval while the run is not READY_TO_APPROVE', () => {
    const fx = makeFixture();
    expect(() => approveRun(fx.db, fx.runId, 'manager@demo', at(10))).toThrowError(
      expect.objectContaining({ code: ERR.RUN_NOT_APPROVABLE }),
    );
  });

  it('refuses approval while integration needs reconnecting', () => {
    const fx = makeFixture();
    fx.db.prepare('UPDATE verification_check SET requirement_type = ? WHERE id = ?').run(
      'NON_RING',
      fx.ringCheckId,
    );
    for (const checkId of [fx.ringCheckId, fx.nonRingCheckId]) {
      const attempt = startAttempt(fx.db, {
        runId: fx.runId,
        checkId,
        actor: 'operator@demo',
        now: T0,
        skewSeconds: 30,
      });
      attest(fx.db, { attemptId: attempt.id, decision: 'PASS', actor: 'operator@demo', now: at(20) });
    }
    setIntegrationState(fx.db, 'RECONNECT_REQUIRED', 'token expired', at(30));

    expect(() => approveRun(fx.db, fx.runId, 'manager@demo', at(40))).toThrowError(
      expect.objectContaining({ code: ERR.RUN_NOT_APPROVABLE }),
    );

    setIntegrationState(fx.db, 'HEALTHY', null, at(50));
    approveRun(fx.db, fx.runId, 'manager@demo', at(60));
    expect(readiness(fx.db, fx.runId).status).toBe('READY');
  });

  it('cancellation is terminal and blocks further attempts', () => {
    const fx = makeFixture();
    cancelRun(fx.db, fx.runId, 'operator@demo', at(10));
    expect(readiness(fx.db, fx.runId).status).toBe('CANCELLED');
    expect(() =>
      startAttempt(fx.db, {
        runId: fx.runId,
        checkId: fx.nonRingCheckId,
        actor: 'operator@demo',
        now: at(20),
        skewSeconds: 30,
      }),
    ).toThrowError(expect.objectContaining({ code: ERR.RUN_TERMINAL }));
  });

  it('writes an audit entry for each accountable action', () => {
    const fx = makeFixture();
    const attempt = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.nonRingCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    attest(fx.db, { attemptId: attempt.id, decision: 'FAIL', actor: 'operator@demo', now: at(20) });

    const actions = fx.db
      .prepare('SELECT action FROM audit_log ORDER BY timestamp')
      .all() as { action: string }[];
    expect(actions.map((a) => a.action)).toEqual(['START_ATTEMPT', 'FAIL']);
  });
});

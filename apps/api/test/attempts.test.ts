import { describe, expect, it } from 'vitest';
import { makeFixture, seedRingEvent, at, T0 } from './helpers/fixture.js';
import {
  attest,
  cancelAttempt,
  claimEvidence,
  latestAttempt,
  recordOverride,
  startAttempt,
} from '../src/domain/attempts.js';
import { ERR } from '../src/domain/errors.js';

const SKEW = 30;

function arm(fx: ReturnType<typeof makeFixture>, checkId: string, now = T0) {
  return startAttempt(fx.db, {
    runId: fx.runId,
    checkId,
    actor: 'operator@demo',
    now,
    skewSeconds: SKEW,
  });
}

describe('session gating (spec sec. 12)', () => {
  it('refuses PASS on a RING_REQUIRED check with no qualifying evidence', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);

    expect(() =>
      attest(fx.db, { attemptId: attempt.id, decision: 'PASS', actor: 'operator@demo', now: at(60) }),
    ).toThrowError(expect.objectContaining({ code: ERR.RING_EVIDENCE_REQUIRED }));
  });

  it('allows FAIL even when no Ring evidence exists', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);

    const result = attest(fx.db, {
      attemptId: attempt.id,
      decision: 'FAIL',
      reason: 'Shutter jammed',
      actor: 'operator@demo',
      now: at(60),
    });

    expect(result.status).toBe('FAIL');
  });

  it('allows PASS once a qualifying session is claimed', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(45) });

    claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(60) });
    const result = attest(fx.db, {
      attemptId: attempt.id,
      decision: 'PASS',
      actor: 'operator@demo',
      now: at(70),
    });

    expect(result.status).toBe('PASS');
    expect(result.ring_event_id).toBe(eventId);
  });

  it('allows PASS on a NON_RING check without any evidence', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.nonRingCheckId);

    const result = attest(fx.db, {
      attemptId: attempt.id,
      decision: 'PASS',
      actor: 'operator@demo',
      now: at(30),
    });

    expect(result.status).toBe('PASS');
    // A non-Ring check never arms a window.
    expect(result.armed_at).toBeNull();
  });
});

describe('evidence matching rules (spec sec. 8)', () => {
  it('rejects an event that started before the skew allowance', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(-SKEW - 1) });

    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(10) }),
    ).toThrowError(expect.objectContaining({ code: ERR.EVENT_OUTSIDE_WINDOW }));
  });

  it('accepts an event inside the skew allowance', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(-SKEW + 1) });

    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(10) }),
    ).not.toThrow();
  });

  it('rejects an event after the session window closes', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(601) });

    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(700) }),
    ).toThrowError(expect.objectContaining({ code: ERR.EVENT_OUTSIDE_WINDOW }));
  });

  it('rejects an event from a different device (no cross-device matching)', () => {
    const fx = makeFixture();
    const otherDevice = 'other-device-id';
    fx.db
      .prepare(
        'INSERT INTO device (id, site_id, provider_device_id, label, status) VALUES (?, ?, ?, ?, ?)',
      )
      .run(otherDevice, fx.siteId, 'synthetic-device-0002', 'Rear door', 'AVAILABLE');
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(60), deviceId: otherDevice });

    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(70) }),
    ).toThrowError(expect.objectContaining({ code: ERR.EVENT_DEVICE_MISMATCH }));
  });

  it('rejects a non-on_demand event even if it lands in the window', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(60), eventType: 'motion' });

    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(70) }),
    ).toThrowError(expect.objectContaining({ code: ERR.EVENT_TYPE_NOT_ELIGIBLE }));
  });

  it('rejects an event quarantined as ambiguous by the media rule', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(60), isAmbiguous: true });

    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(70) }),
    ).toThrowError(expect.objectContaining({ code: ERR.EVENT_AMBIGUOUS }));
  });

  it('lets only one attempt claim a given provider event', () => {
    const fx = makeFixture();
    const first = arm(fx, fx.ringCheckId);
    const eventId = seedRingEvent(fx, { startAt: at(60) });
    claimEvidence(fx.db, { attemptId: first.id, ringEventId: eventId, actor: 'system', now: at(70) });
    attest(fx.db, { attemptId: first.id, decision: 'PASS', actor: 'operator@demo', now: at(80) });

    // A second check on the same device must not consume the same session.
    const secondCheck = 'second-ring-check';
    fx.db
      .prepare(
        'INSERT INTO verification_check (id, template_id, device_id, label, requirement_type, required, session_window_seconds, sort_order) VALUES (?, ?, ?, ?, ?, 1, 600, 4)',
      )
      .run(secondCheck, fx.templateId, fx.deviceId, 'Second sweep', 'RING_REQUIRED');
    const second = arm(fx, secondCheck);

    expect(() =>
      claimEvidence(fx.db, { attemptId: second.id, ringEventId: eventId, actor: 'system', now: at(90) }),
    ).toThrowError(expect.objectContaining({ code: ERR.EVENT_ALREADY_CLAIMED }));
  });
});

describe('attempt immutability (spec sec. 7)', () => {
  it('refuses to re-attest an attempt that already has a decision', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.nonRingCheckId);
    attest(fx.db, { attemptId: attempt.id, decision: 'FAIL', actor: 'operator@demo', now: at(30) });

    expect(() =>
      attest(fx.db, { attemptId: attempt.id, decision: 'PASS', actor: 'operator@demo', now: at(60) }),
    ).toThrowError(expect.objectContaining({ code: ERR.ATTEMPT_NOT_OPEN }));
  });

  it('blocks a direct UPDATE of an attested attempt at the database level', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.nonRingCheckId);
    attest(fx.db, { attemptId: attempt.id, decision: 'FAIL', actor: 'operator@demo', now: at(30) });

    expect(() =>
      fx.db.prepare("UPDATE verification_attempt SET status = 'PASS' WHERE id = ?").run(attempt.id),
    ).toThrow(/immutable/i);
  });

  it('blocks deletion of an attempt', () => {
    const fx = makeFixture();
    const attempt = arm(fx, fx.nonRingCheckId);

    expect(() =>
      fx.db.prepare('DELETE FROM verification_attempt WHERE id = ?').run(attempt.id),
    ).toThrow(/retained for audit/i);
  });

  it('keeps the failed attempt when a recheck passes', () => {
    const fx = makeFixture();
    const first = arm(fx, fx.nonRingCheckId);
    attest(fx.db, {
      attemptId: first.id,
      decision: 'FAIL',
      reason: 'Panel not armed',
      actor: 'operator@demo',
      now: at(30),
    });

    const second = arm(fx, fx.nonRingCheckId, at(120));
    attest(fx.db, { attemptId: second.id, decision: 'PASS', actor: 'operator@demo', now: at(150) });

    const rows = fx.db
      .prepare(
        'SELECT id, attempt_number, status, supersedes_attempt_id FROM verification_attempt WHERE check_id = ? ORDER BY attempt_number',
      )
      .all(fx.nonRingCheckId) as { attempt_number: number; status: string; supersedes_attempt_id: string | null }[];

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ attempt_number: 1, status: 'FAIL' });
    expect(rows[1]).toMatchObject({ attempt_number: 2, status: 'PASS', supersedes_attempt_id: first.id });
    expect(latestAttempt(fx.db, fx.runId, fx.nonRingCheckId)?.status).toBe('PASS');
  });

  it('refuses a second open attempt while one is already in progress', () => {
    const fx = makeFixture();
    arm(fx, fx.nonRingCheckId);

    expect(() => arm(fx, fx.nonRingCheckId, at(10))).toThrowError(
      expect.objectContaining({ code: ERR.ATTEMPT_ALREADY_OPEN }),
    );
  });

  it('ignores a cancelled attempt when resolving the latest attempt', () => {
    const fx = makeFixture();
    const first = arm(fx, fx.nonRingCheckId);
    attest(fx.db, { attemptId: first.id, decision: 'PASS', actor: 'operator@demo', now: at(20) });
    const second = arm(fx, fx.nonRingCheckId, at(60));
    cancelAttempt(fx.db, second.id, 'operator@demo', at(70));

    expect(latestAttempt(fx.db, fx.runId, fx.nonRingCheckId)?.id).toBe(first.id);
  });
});

describe('manager override (spec sec. 13)', () => {
  it('records OVERRIDDEN as a new attempt and never as PASS', () => {
    const fx = makeFixture();
    const failed = arm(fx, fx.nonRingCheckId);
    attest(fx.db, { attemptId: failed.id, decision: 'FAIL', actor: 'operator@demo', now: at(30) });

    const override = recordOverride(fx.db, {
      runId: fx.runId,
      checkId: fx.nonRingCheckId,
      approver: 'manager@demo',
      reason: 'Panel verified in person; sensor faulty, engineer booked',
      now: at(100),
    });

    expect(override.status).toBe('OVERRIDDEN');
    expect(override.supersedes_attempt_id).toBe(failed.id);
    expect(override.approved_by).toBe('manager@demo');
    expect(override.override_reason).toMatch(/engineer booked/);

    const statuses = fx.db
      .prepare('SELECT status FROM verification_attempt WHERE check_id = ? ORDER BY attempt_number')
      .all(fx.nonRingCheckId) as { status: string }[];
    expect(statuses.map((r) => r.status)).toEqual(['FAIL', 'OVERRIDDEN']);
  });

  it('requires a written reason', () => {
    const fx = makeFixture();

    expect(() =>
      recordOverride(fx.db, {
        runId: fx.runId,
        checkId: fx.nonRingCheckId,
        approver: 'manager@demo',
        reason: '   ',
        now: at(100),
      }),
    ).toThrowError(expect.objectContaining({ code: ERR.OVERRIDE_REASON_REQUIRED }));
  });
});

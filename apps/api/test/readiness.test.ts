import { describe, expect, it } from 'vitest';
import { deriveReadiness, type CheckSnapshot, type RunSnapshot } from '../src/domain/readiness.js';

/**
 * Deterministic precedence (spec v7 sec. 11). These are pure-function tests: the
 * same snapshot must always produce the same status, with no clock and no AI.
 */

function check(partial: Partial<CheckSnapshot> = {}): CheckSnapshot {
  return {
    checkId: 'c1',
    label: 'Front entrance walkthrough',
    required: true,
    requirementType: 'NON_RING',
    latestAttempt: null,
    deviceUnavailable: false,
    coveredWindowExpiredWithoutSession: false,
    ...partial,
  };
}

function run(partial: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    cancelledAt: null,
    approvedAt: null,
    integrationState: 'HEALTHY',
    checks: [check()],
    openIncidents: [],
    ...partial,
  };
}

const passed = { status: 'PASS', hasQualifyingRingEvidence: false } as const;
const failed = { status: 'FAIL', hasQualifyingRingEvidence: false } as const;
const inProgress = { status: 'IN_PROGRESS', hasQualifyingRingEvidence: false } as const;

describe('precedence', () => {
  it('CANCELLED wins over everything', () => {
    const result = deriveReadiness(
      run({ cancelledAt: '2026-10-07T10:00:00Z', approvedAt: '2026-10-07T09:00:00Z' }),
    );
    expect(result.status).toBe('CANCELLED');
  });

  it('READY when approval has been recorded', () => {
    expect(deriveReadiness(run({ approvedAt: '2026-10-07T10:00:00Z' })).status).toBe('READY');
  });

  it('NOT_STARTED when no attempt has begun', () => {
    expect(deriveReadiness(run()).status).toBe('NOT_STARTED');
  });

  it('NOT_READY immediately on a required FAIL', () => {
    const result = deriveReadiness(run({ checks: [check({ latestAttempt: failed })] }));
    expect(result.status).toBe('NOT_READY');
    expect(result.reasons[0]?.code).toBe('REQUIRED_CHECK_FAILED');
  });

  it('a required FAIL outranks a blocker', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({ checkId: 'a', latestAttempt: failed }),
          check({ checkId: 'b', latestAttempt: inProgress, deviceUnavailable: true }),
        ],
      }),
    );
    expect(result.status).toBe('NOT_READY');
  });

  it('an optional FAIL does not make the run NOT_READY', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({ checkId: 'a', latestAttempt: passed }),
          check({ checkId: 'b', required: false, latestAttempt: failed }),
        ],
      }),
    );
    expect(result.status).toBe('READY_TO_APPROVE');
  });

  it('BLOCKED when a required device is confirmed unavailable', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({
            requirementType: 'RING_REQUIRED',
            latestAttempt: inProgress,
            deviceUnavailable: true,
          }),
        ],
      }),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons[0]?.code).toBe('REQUIRED_DEVICE_UNAVAILABLE');
  });

  it('BLOCKED when a covered window expired with no qualifying session', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({
            requirementType: 'RING_REQUIRED',
            latestAttempt: inProgress,
            coveredWindowExpiredWithoutSession: true,
          }),
        ],
      }),
    );
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons[0]?.message).toMatch(/not evidence about the site/i);
  });

  it('IN_PROGRESS while a required check has no decision yet', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({ checkId: 'a', latestAttempt: passed }),
          check({ checkId: 'b', latestAttempt: inProgress }),
        ],
      }),
    );
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.reasons.map((r) => r.code)).toContain('REQUIRED_CHECK_INCOMPLETE');
  });

  it('READY_TO_APPROVE when every required check is satisfied', () => {
    expect(deriveReadiness(run({ checks: [check({ latestAttempt: passed })] })).status).toBe(
      'READY_TO_APPROVE',
    );
  });

  it('an approved override satisfies the gate', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({ latestAttempt: { status: 'OVERRIDDEN', hasQualifyingRingEvidence: false } }),
        ],
      }),
    );
    expect(result.status).toBe('READY_TO_APPROVE');
  });
});

describe('Ring evidence gate', () => {
  it('a RING_REQUIRED PASS without evidence cannot reach READY_TO_APPROVE', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({
            requirementType: 'RING_REQUIRED',
            latestAttempt: { status: 'PASS', hasQualifyingRingEvidence: false },
          }),
        ],
      }),
    );
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.reasons[0]?.code).toBe('RING_EVIDENCE_MISSING');
  });

  it('a RING_REQUIRED PASS with evidence does', () => {
    const result = deriveReadiness(
      run({
        checks: [
          check({
            requirementType: 'RING_REQUIRED',
            latestAttempt: { status: 'PASS', hasQualifyingRingEvidence: true },
          }),
        ],
      }),
    );
    expect(result.status).toBe('READY_TO_APPROVE');
  });
});

describe('integration overlay versus coverage evidence (spec sec. 10)', () => {
  it('RECONNECT_REQUIRED blocks approval but does not create BLOCKED', () => {
    const result = deriveReadiness(
      run({
        integrationState: 'RECONNECT_REQUIRED',
        checks: [check({ latestAttempt: passed })],
      }),
    );
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.integrationState).toBe('RECONNECT_REQUIRED');
    expect(result.reasons.map((r) => r.code)).toContain('INTEGRATION_RECONNECT_REQUIRED');
  });

  it('wording for an integration problem never implies site evidence', () => {
    const result = deriveReadiness(
      run({ integrationState: 'RECONNECT_REQUIRED', checks: [check({ latestAttempt: passed })] }),
    );
    const message = result.reasons.find(
      (r) => r.code === 'INTEGRATION_RECONNECT_REQUIRED',
    )?.message;
    expect(message).toMatch(/not evidence about the site/i);
  });
});

describe('blocking incidents (spec sec. 13)', () => {
  it.each(['BLOCKER', 'HIGH'] as const)('%s prevents READY_TO_APPROVE', (severity) => {
    const result = deriveReadiness(
      run({
        checks: [check({ latestAttempt: passed })],
        openIncidents: [{ incidentId: 'i1', checkId: 'c1', severity }],
      }),
    );
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.reasons.map((r) => r.code)).toContain('BLOCKING_INCIDENT_OPEN');
  });

  it.each(['MEDIUM', 'LOW'] as const)('%s does not block readiness', (severity) => {
    const result = deriveReadiness(
      run({
        checks: [check({ latestAttempt: passed })],
        openIncidents: [{ incidentId: 'i1', checkId: 'c1', severity }],
      }),
    );
    expect(result.status).toBe('READY_TO_APPROVE');
  });
});

describe('explanation quality', () => {
  it('never claims the site is safe, clear, or that a person was detected', () => {
    const snapshots = [
      run(),
      run({ checks: [check({ latestAttempt: failed })] }),
      run({ checks: [check({ latestAttempt: passed })] }),
      run({
        checks: [
          check({ requirementType: 'RING_REQUIRED', latestAttempt: inProgress, deviceUnavailable: true }),
        ],
      }),
      run({ integrationState: 'RECONNECT_REQUIRED', checks: [check({ latestAttempt: passed })] }),
    ];
    const forbidden = /person detected|motion detected|site is safe|site was clear|verified safe|proven clear/i;

    for (const snapshot of snapshots) {
      for (const reason of deriveReadiness(snapshot).reasons) {
        expect(reason.message).not.toMatch(forbidden);
      }
    }
  });
});

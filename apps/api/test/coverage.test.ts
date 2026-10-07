import { describe, expect, it } from 'vitest';
import { makeFixture, seedCoverage, seedRingEvent, at, T0 } from './helpers/fixture.js';
import { claimEvidence, startAttempt } from '../src/domain/attempts.js';
import { readiness, setIntegrationState } from '../src/domain/runs.js';

/**
 * Case B of spec sec. 10, through the database rather than as a pure function:
 * a BLOCKER needs the window expired AND a sync that covered the whole window
 * AND no qualifying session. Missing any one of the three is "not yet observed".
 */

function armRingCheck(fx: ReturnType<typeof makeFixture>) {
  return startAttempt(fx.db, {
    runId: fx.runId,
    checkId: fx.ringCheckId,
    actor: 'operator@demo',
    now: T0,
    skewSeconds: 30,
  });
}

const AFTER_WINDOW = at(900); // window is 600s

describe('sync coverage gating (spec sec. 9.4, 10)', () => {
  it('does not block while the window is still open, even with no session yet', () => {
    const fx = makeFixture();
    armRingCheck(fx);
    expect(readiness(fx.db, fx.runId, at(120)).status).toBe('IN_PROGRESS');
  });

  it('does not block when the window expired but no sync covered it', () => {
    const fx = makeFixture();
    armRingCheck(fx);
    // No sync_coverage row: we never confirmed we looked, so this is not evidence.
    const result = readiness(fx.db, fx.runId, AFTER_WINDOW);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.reasons.map((r) => r.code)).not.toContain('COVERED_WINDOW_NO_SESSION');
  });

  it('does not block when the sync ran but did not reach older records', () => {
    const fx = makeFixture();
    const attempt = armRingCheck(fx);
    seedCoverage(fx, attempt.id, false); // traversal stopped early
    expect(readiness(fx.db, fx.runId, AFTER_WINDOW).status).toBe('IN_PROGRESS');
  });

  it('blocks once an expired window was fully covered and nothing qualified', () => {
    const fx = makeFixture();
    const attempt = armRingCheck(fx);
    seedCoverage(fx, attempt.id, true);

    const result = readiness(fx.db, fx.runId, AFTER_WINDOW);
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons[0]?.code).toBe('COVERED_WINDOW_NO_SESSION');
  });

  it('does not block when a qualifying session was claimed', () => {
    const fx = makeFixture();
    const attempt = armRingCheck(fx);
    const eventId = seedRingEvent(fx, { startAt: at(120) });
    claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: eventId, actor: 'system', now: at(130) });
    seedCoverage(fx, attempt.id, true);

    expect(readiness(fx.db, fx.runId, AFTER_WINDOW).status).toBe('IN_PROGRESS');
  });

  it('an integration failure during the window never becomes a coverage blocker', () => {
    const fx = makeFixture();
    armRingCheck(fx);
    setIntegrationState(fx.db, 'RECONNECT_REQUIRED', '401 from history request', at(60));

    const result = readiness(fx.db, fx.runId, AFTER_WINDOW);
    expect(result.status).not.toBe('BLOCKED');
    expect(result.integrationState).toBe('RECONNECT_REQUIRED');
    expect(result.reasons.map((r) => r.code)).toContain('INTEGRATION_RECONNECT_REQUIRED');
  });

  it('a device confirmed unavailable does block (Case A)', () => {
    const fx = makeFixture();
    armRingCheck(fx);
    fx.db
      .prepare('UPDATE device SET status = ?, last_status_at = ? WHERE id = ?')
      .run('UNAVAILABLE', at(60).toISOString(), fx.deviceId);

    const result = readiness(fx.db, fx.runId, at(120));
    expect(result.status).toBe('BLOCKED');
    expect(result.reasons[0]?.code).toBe('REQUIRED_DEVICE_UNAVAILABLE');
  });

  it('a device whose status is still UNKNOWN does not block', () => {
    const fx = makeFixture();
    armRingCheck(fx);
    fx.db.prepare('UPDATE device SET status = ? WHERE id = ?').run('UNKNOWN', fx.deviceId);

    expect(readiness(fx.db, fx.runId, at(120)).status).toBe('IN_PROGRESS');
  });
});

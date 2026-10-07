import { describe, expect, it } from 'vitest';
import { makeFixture, at, T0 } from './helpers/fixture.js';
import { RingClient } from '../src/ring/client.js';
import { recordCoverage, syncDeviceHistory, type SyncOptions } from '../src/ring/sync.js';
import { claimEvidence, startAttempt } from '../src/domain/attempts.js';
import { readiness } from '../src/domain/runs.js';
import { DEVICE_B, realHistoryPage, stubFetch, syntheticPage } from './fixtures/ring.js';

/**
 * Pagination traversal is proven here against SYNTHETIC multi-page fixtures.
 * Real provider pagination is still unverified (Day-1 T4 inconclusive), so these
 * tests prove our algorithm only - never Ring's behaviour.
 */

const BASE = 'https://api.example.invalid';
const token = { getToken: () => 'test-token' };

function options(fx: ReturnType<typeof makeFixture>, overrides: Partial<SyncOptions> = {}): SyncOptions {
  return {
    providerDeviceId: fx.providerDeviceId,
    deviceId: fx.deviceId,
    windowStart: at(-30),
    windowEnd: at(600),
    pageCap: 10,
    observationMarginSeconds: 60,
    now: at(700),
    ...overrides,
  };
}

function clientFor(routes: Parameters<typeof stubFetch>[0]) {
  const { impl, calls } = stubFetch(routes);
  return { client: new RingClient({ baseUrl: BASE, tokenProvider: token, fetchImpl: impl }), calls };
}

const ms = (seconds: number) => at(seconds).getTime();

describe('history sync traversal', () => {
  it('stores only eligible events and ignores the rest', async () => {
    const fx = makeFixture();
    const { client } = clientFor(() => ({
      body: syntheticPage(
        [
          { id: 'ok-1', startMs: ms(100), deviceId: fx.providerDeviceId },
          { id: 'wrong-type', startMs: ms(110), eventType: 'motion', deviceId: fx.providerDeviceId },
          { id: 'wrong-device', startMs: ms(120), deviceId: DEVICE_B },
        ],
        null,
      ),
    }));

    const result = await syncDeviceHistory(fx.db, client, options(fx));

    expect(result.eventsSeen).toBe(3);
    expect(result.eligibleEventsStored).toBe(1);
    const stored = fx.db.prepare('SELECT provider_event_id, event_type FROM ring_event').all() as {
      provider_event_id: string;
      event_type: string;
    }[];
    expect(stored).toEqual([{ provider_event_id: 'ok-1', event_type: 'on_demand' }]);
  });

  it('follows links.next and stops at the true end of the list', async () => {
    const fx = makeFixture();
    const { client, calls } = clientFor((url) => {
      if (url.includes('page=2')) {
        return { body: syntheticPage([{ id: 'e2', startMs: ms(200), deviceId: fx.providerDeviceId }], null) };
      }
      return {
        body: syntheticPage([{ id: 'e1', startMs: ms(300), deviceId: fx.providerDeviceId }], '/v1/history?page=2'),
      };
    });

    const result = await syncDeviceHistory(fx.db, client, options(fx));

    expect(calls).toHaveLength(2);
    expect(result.pagesFetched).toBe(2);
    expect(result.eligibleEventsStored).toBe(2);
    expect(result.stopReason).toBe('NO_NEXT_LINK');
    expect(result.reachedOlder).toBe(true);
  });

  it('stops once a page carries records older than the window start', async () => {
    const fx = makeFixture();
    const { client, calls } = clientFor((url) => {
      if (url.includes('page=2')) {
        return {
          body: syntheticPage(
            [{ id: 'old', startMs: ms(-5000), deviceId: fx.providerDeviceId }],
            '/v1/history?page=3',
          ),
        };
      }
      return {
        body: syntheticPage([{ id: 'e1', startMs: ms(100), deviceId: fx.providerDeviceId }], '/v1/history?page=2'),
      };
    });

    const result = await syncDeviceHistory(fx.db, client, options(fx));

    expect(result.stopReason).toBe('REACHED_OLDER_THAN_WINDOW');
    expect(result.reachedOlder).toBe(true);
    expect(calls).toHaveLength(2); // page 3 never requested
  });

  it('aborts safely when the provider repeats a next url', async () => {
    const fx = makeFixture();
    const { client } = clientFor(() => ({
      // Every page points back at itself.
      body: syntheticPage([{ id: 'loop', startMs: ms(100), deviceId: fx.providerDeviceId }], '/v1/history?page=loop'),
    }));

    const result = await syncDeviceHistory(fx.db, client, options(fx));

    expect(result.stopReason).toBe('REPEATED_NEXT_URL');
    expect(result.coversWindow).toBe(false);
    const cursor = fx.db.prepare('SELECT repeated_next_url_count FROM sync_cursor').get() as {
      repeated_next_url_count: number;
    };
    expect(cursor.repeated_next_url_count).toBe(1);
  });

  it('honours the page cap', async () => {
    const fx = makeFixture();
    let page = 0;
    const { client } = clientFor(() => {
      page += 1;
      return {
        body: syntheticPage(
          [{ id: `e${page}`, startMs: ms(100 + page), deviceId: fx.providerDeviceId }],
          `/v1/history?page=${page + 1}`,
        ),
      };
    });

    const result = await syncDeviceHistory(fx.db, client, options(fx, { pageCap: 3 }));

    expect(result.pagesFetched).toBe(3);
    expect(result.stopReason).toBe('PAGE_CAP_REACHED');
    // A capped traversal is explicitly NOT coverage.
    expect(result.reachedOlder).toBe(false);
    expect(result.coversWindow).toBe(false);
  });

  it('is idempotent - a repeat sync does not duplicate events', async () => {
    const fx = makeFixture();
    const { client } = clientFor(() => ({
      body: syntheticPage([{ id: 'stable', startMs: ms(100), deviceId: fx.providerDeviceId }], null),
    }));

    await syncDeviceHistory(fx.db, client, options(fx));
    const second = await syncDeviceHistory(fx.db, client, options(fx));

    expect(second.eligibleEventsStored).toBe(0);
    const count = fx.db.prepare('SELECT COUNT(*) AS n FROM ring_event').get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('parses the real captured payload shape end to end', async () => {
    const fx = makeFixture();
    // Re-point the fixture device at the id used in the real capture.
    const realDeviceId = realHistoryPage.data[0]!.relationships.source.data.id;
    fx.db.prepare('UPDATE device SET provider_device_id = ? WHERE id = ?').run(realDeviceId, fx.deviceId);

    const { client } = clientFor(() => ({ body: realHistoryPage }));
    const result = await syncDeviceHistory(
      fx.db,
      client,
      options(fx, {
        providerDeviceId: realDeviceId,
        windowStart: new Date(1791372135600 - 30_000),
        windowEnd: new Date(1791372135600 + 600_000),
        now: new Date(1791372135600 + 900_000),
      }),
    );

    expect(result.eligibleEventsStored).toBe(1);
    const stored = fx.db.prepare('SELECT event_type, start_at, end_at FROM ring_event').get() as {
      event_type: string;
      start_at: string;
      end_at: string;
    };
    expect(stored.event_type).toBe('on_demand');
    expect(stored.start_at).toBe(new Date(1791372135600).toISOString());
    expect(stored.end_at).toBe(new Date(1791372885600).toISOString());
  });
});

describe('integration failure is never negative evidence (spec sec. 10)', () => {
  it('propagates a 401 as RECONNECT_REQUIRED and stores no coverage', async () => {
    const fx = makeFixture();
    const { client } = clientFor(() => ({ status: 401, body: '' }));

    await expect(syncDeviceHistory(fx.db, client, options(fx))).rejects.toMatchObject({
      kind: 'RECONNECT_REQUIRED',
    });

    const coverage = fx.db.prepare('SELECT COUNT(*) AS n FROM sync_coverage').get() as { n: number };
    expect(coverage.n).toBe(0);
    const cursor = fx.db.prepare('SELECT error_count, last_success_at FROM sync_cursor').get() as {
      error_count: number;
      last_success_at: string | null;
    };
    expect(cursor.error_count).toBe(1);
    expect(cursor.last_success_at).toBeNull();
  });

  it('a mid-traversal failure leaves the run unable to claim coverage', async () => {
    const fx = makeFixture();
    const { client } = clientFor((url) =>
      url.includes('page=2')
        ? { status: 500, body: { errors: [{ code: 'INTERNAL', detail: 'boom' }] } }
        : { body: syntheticPage([{ id: 'e1', startMs: ms(100), deviceId: fx.providerDeviceId }], '/v1/history?page=2') },
    );

    await expect(syncDeviceHistory(fx.db, client, options(fx))).rejects.toMatchObject({
      kind: 'TRANSPORT',
    });

    const attempt = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.ringCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    // The window has expired but nothing covered it, so the run must not be BLOCKED.
    expect(readiness(fx.db, fx.runId, at(900)).status).toBe('IN_PROGRESS');
    expect(attempt.status).toBe('IN_PROGRESS');
  });

  it('a malformed provider response is an integration error, not an empty result', async () => {
    const fx = makeFixture();
    const { client } = clientFor(() => ({ body: { unexpected: 'shape' } }));
    await expect(syncDeviceHistory(fx.db, client, options(fx))).rejects.toMatchObject({
      kind: 'MALFORMED_RESPONSE',
    });
  });
});

describe('coverage recording (spec sec. 9.4)', () => {
  it('requires both the observation margin and a complete traversal', async () => {
    const fx = makeFixture();
    const { client } = clientFor(() => ({ body: syntheticPage([], null) }));

    const tooSoon = await syncDeviceHistory(fx.db, client, options(fx, { now: at(630) }));
    expect(tooSoon.reachedOlder).toBe(true);
    expect(tooSoon.coversWindow).toBe(false); // margin of 60s not yet elapsed

    const afterMargin = await syncDeviceHistory(fx.db, client, options(fx, { now: at(700) }));
    expect(afterMargin.coversWindow).toBe(true);
  });

  it('writes nothing when the sync did not cover the window', async () => {
    const fx = makeFixture();
    const attempt = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.ringCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    const { client } = clientFor(() => ({ body: syntheticPage([], null) }));
    const result = await syncDeviceHistory(fx.db, client, options(fx, { now: at(610) }));

    expect(recordCoverage(fx.db, attempt.id, options(fx, { now: at(610) }), result)).toBe(false);
    const rows = fx.db.prepare('SELECT COUNT(*) AS n FROM sync_coverage').get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it('a covered sync with no session turns an expired window into a blocker', async () => {
    const fx = makeFixture();
    const attempt = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.ringCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    const { client } = clientFor(() => ({ body: syntheticPage([], null) }));
    const opts = options(fx, { now: at(700) });
    const result = await syncDeviceHistory(fx.db, client, opts);

    expect(recordCoverage(fx.db, attempt.id, opts, result)).toBe(true);
    const verdict = readiness(fx.db, fx.runId, at(900));
    expect(verdict.status).toBe('BLOCKED');
    expect(verdict.reasons[0]?.code).toBe('COVERED_WINDOW_NO_SESSION');
  });

  it('a synced session can be claimed and unlocks PASS', async () => {
    const fx = makeFixture();
    const attempt = startAttempt(fx.db, {
      runId: fx.runId,
      checkId: fx.ringCheckId,
      actor: 'operator@demo',
      now: T0,
      skewSeconds: 30,
    });
    const { client } = clientFor(() => ({
      body: syntheticPage([{ id: 'session-1', startMs: ms(120), deviceId: fx.providerDeviceId }], null),
    }));

    await syncDeviceHistory(fx.db, client, options(fx));

    const stored = fx.db.prepare('SELECT id FROM ring_event WHERE provider_event_id = ?').get('session-1') as {
      id: string;
    };
    expect(() =>
      claimEvidence(fx.db, { attemptId: attempt.id, ringEventId: stored.id, actor: 'system', now: at(130) }),
    ).not.toThrow();
  });
});

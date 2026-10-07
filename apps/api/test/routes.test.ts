import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { RingClient } from '../src/ring/client.js';
import { RingTokenStore } from '../src/ring/tokenStore.js';
import { REVIEW_RUN_ID, seedReviewMode } from '../src/seed/reviewMode.js';
import { DEVICE_A, realDeviceList, stubFetch, syntheticPage } from './fixtures/ring.js';

/**
 * HTTP-level tests. The Ring provider is a stub serving the measured Day-1
 * shapes; every other layer - routes, workflow, domain, SQLite triggers - is real.
 */

const BASE = 'https://api.example.invalid';
// A syntactically valid JWT whose exp is far in the future. Not a real credential.
const FAKE_TOKEN = [
  'eyJhbGciOiJub25lIn0',
  Buffer.from(JSON.stringify({ exp: 4102444800, scopes: ['ava.v1:read'] })).toString('base64url'),
  'c2lnbmF0dXJl',
].join('.');

const FORBIDDEN = /person detected|motion detected|site is safe|site was clear|area is clear|verified safe|proven clear|four-eyes|manager sign-off/i;

interface Harness {
  app: FastifyInstance;
  db: DatabaseSync;
  clock: { now: Date };
  setRoute: (handler: (url: string) => { status?: number; body: unknown }) => void;
  calls: string[];
}

let current: Harness | undefined;

function harness(): Harness {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  const clock = { now: new Date('2026-10-08T09:00:00.000Z') };
  let route: (url: string) => { status?: number; body: unknown } = () => ({ body: realDeviceList });
  const { impl, calls } = stubFetch((url) => route(url));
  const tokenStore = new RingTokenStore();
  const app = buildApp({
    db,
    tokenStore,
    ringClient: new RingClient({ baseUrl: BASE, tokenProvider: tokenStore, fetchImpl: impl }),
    now: () => clock.now,
  });
  current = {
    app,
    db,
    clock,
    calls,
    setRoute: (handler) => {
      route = handler;
    },
  };
  return current;
}

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const advance = (h: Harness, seconds: number) => {
  h.clock.now = new Date(h.clock.now.getTime() + seconds * 1000);
};

/** realDeviceList with the device reported online, for tests that must isolate another variable. */
const onlineDeviceList = {
  ...realDeviceList,
  included: realDeviceList.included.map((r) =>
    r.type === 'device-status' ? { ...r, attributes: { ...r.attributes, online: true } } : r,
  ),
};

/**
 * Connects with the fake token and creates a live run. Returns ids.
 * Defaults to an ONLINE device; the measured Day-1 device was offline, which is
 * its own test case below.
 */
async function liveRun(h: Harness, options: { deviceOnline?: boolean } = {}) {
  const devices = options.deviceOnline === false ? realDeviceList : onlineDeviceList;
  h.setRoute(() => ({ body: devices }));
  const connect = await h.app.inject({ method: 'POST', url: '/api/ring/connect', payload: { token: FAKE_TOKEN } });
  expect(connect.statusCode).toBe(200);
  const created = await h.app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { templateId: connect.json().templateId },
  });
  expect(created.statusCode).toBe(201);
  const run = created.json();
  const ringCheck = run.checks.find((c: { requirementType: string }) => c.requirementType === 'RING_REQUIRED');
  const manualCheck = run.checks.find(
    (c: { requirementType: string; required: boolean }) => c.requirementType === 'NON_RING' && c.required,
  );
  return { runId: run.id as string, ringCheckId: ringCheck.id as string, manualCheckId: manualCheck.id as string };
}

describe('Review Mode (spec sec. 19)', () => {
  it('serves the recorded run as READY with the required banner', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const res = await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` });
    const run = res.json();

    expect(res.statusCode).toBe(200);
    expect(run.dataMode).toBe('RECORDED_DEMO');
    expect(run.dataModeLabel).toBe('RECORDED DEMO - Ring Playground capture: 2026-10-07');
    expect(run.readiness.status).toBe('READY');
  });

  it('shows the captured session as evidence, with its limits', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` })).json();
    const ring = run.checks.find((c: { requirementType: string }) => c.requirementType === 'RING_REQUIRED');

    expect(ring.latestAttempt.status).toBe('PASS');
    expect(ring.latestAttempt.evidence).toMatchObject({
      label: 'Ring session observed during this check window',
      sessionStartAt: '2026-10-07T11:22:15.600Z',
      isSimulated: true,
    });
    expect(ring.latestAttempt.evidence.limits.join(' ')).toMatch(/does not establish that the area was clear/i);
  });

  it('keeps the failed attempt beside its recheck', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` })).json();
    const alarm = run.checks.find((c: { label: string }) => c.label.startsWith('Alarm panel'));

    expect(alarm.attempts.map((a: { status: string }) => a.status)).toEqual(['FAIL', 'PASS']);
    expect(alarm.attempts[1].supersedesAttemptId).toBe(alarm.attempts[0].id);
  });

  it('shows an override as OVERRIDDEN, never as PASS', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` })).json();
    const notes = run.checks.find((c: { label: string }) => c.label.startsWith('Previous shift'));

    expect(notes.latestAttempt.status).toBe('OVERRIDDEN');
    expect(notes.latestAttempt.statusLabel).not.toMatch(/pass/i);
    expect(notes.latestAttempt.override.reason).toMatch(/confirmed by phone/);
  });

  it('records the incident lifecycle through to human resolution', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` })).json();
    const alarmIncident = run.incidents.find((i: { checkLabel: string }) => i.checkLabel.startsWith('Alarm panel'));

    expect(alarmIncident.status).toBe('RESOLVED');
    expect(alarmIncident.resolvedBy).toBe('demo.operator');
    expect(alarmIncident.actions.map((a: { action: string }) => a.action)).toEqual([
      'OPEN',
      'ACKNOWLEDGED',
      'ACTION_REQUIRED',
      'RECHECKING',
      'READY_TO_RESOLVE',
      'RESOLVED',
    ]);
    // The system advanced it to READY_TO_RESOLVE; only a person resolved it.
    const resolved = alarmIncident.actions.find((a: { action: string }) => a.action === 'RESOLVED');
    expect(resolved.actor).not.toBe('system');
  });

  it('refuses to change or sync a recorded run', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` })).json();
    const ring = run.checks[0];

    for (const url of [
      `/api/runs/${REVIEW_RUN_ID}/checks/${ring.id}/start`,
      `/api/runs/${REVIEW_RUN_ID}/checks/${ring.id}/sync`,
      `/api/runs/${REVIEW_RUN_ID}/cancel`,
    ]) {
      const res = await h.app.inject({ method: 'POST', url });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toMatch(/recorded demo run/i);
    }
  });

  it('refuses incident transitions on the recorded run at the API, not just in the UI', async () => {
    const h = harness();
    seedReviewMode(h.db);
    // Every seeded incident is already closed, so a transition on one would fail on
    // the lifecycle rule alone. Plant an OPEN incident so only the guard can stop it.
    const check = h.db.prepare('SELECT id FROM verification_check WHERE id = ?').get('check-recorded-float') as { id: string };
    h.db
      .prepare(
        "INSERT INTO incident (id, check_id, run_id, severity, status, reason, created_at) VALUES ('planted', ?, ?, 'HIGH', 'OPEN', 'planted', ?)",
      )
      .run(check.id, REVIEW_RUN_ID, new Date().toISOString());

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/incidents/planted/transition',
      payload: { to: 'ACKNOWLEDGED' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/recorded demo run/i);
  });

  it('produces an audit trail for every accountable action', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const audit = (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}/audit` })).json();
    const actions = audit.map((a: { action: string }) => a.action);

    for (const expected of ['START_ATTEMPT', 'CLAIM_EVIDENCE', 'PASS', 'FAIL', 'RECHECK', 'OVERRIDE', 'DISMISS', 'APPROVE']) {
      expect(actions).toContain(expected);
    }
  });
});

describe('Live Test Mode connection (spec sec. 19, 24)', () => {
  it('discovers devices dynamically and never echoes the token', async () => {
    const h = harness();
    const res = await h.app.inject({ method: 'POST', url: '/api/ring/connect', payload: { token: FAKE_TOKEN } });

    expect(res.statusCode).toBe(200);
    expect(res.json().devicesDiscovered).toBe(1);
    expect(res.body).not.toContain(FAKE_TOKEN);
    expect((await h.app.inject({ method: 'GET', url: '/api/meta' })).body).not.toContain(FAKE_TOKEN);
    expect((await h.app.inject({ method: 'GET', url: '/api/ring/status' })).body).not.toContain(FAKE_TOKEN);
  });

  it('never writes the token to SQLite', async () => {
    const h = harness();
    await h.app.inject({ method: 'POST', url: '/api/ring/connect', payload: { token: FAKE_TOKEN } });

    const tables = h.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const { name } of tables) {
      const dump = JSON.stringify(h.db.prepare(`SELECT * FROM "${name}"`).all());
      expect(dump).not.toContain(FAKE_TOKEN);
    }
  });

  it('drops a token Ring rejects', async () => {
    const h = harness();
    h.setRoute(() => ({ status: 401, body: '' }));
    const res = await h.app.inject({ method: 'POST', url: '/api/ring/connect', payload: { token: FAKE_TOKEN } });

    expect(res.statusCode).toBe(409);
    const status = (await h.app.inject({ method: 'GET', url: '/api/ring/status' })).json();
    expect(status.connected).toBe(false);
    expect(status.integrationState).toBe('RECONNECT_REQUIRED');
  });

  it('rejects an already-expired token without calling Ring', async () => {
    const h = harness();
    const expired = [
      'eyJhbGciOiJub25lIn0',
      Buffer.from(JSON.stringify({ exp: 1000 })).toString('base64url'),
      'c2ln',
    ].join('.');
    const res = await h.app.inject({ method: 'POST', url: '/api/ring/connect', payload: { token: expired } });

    expect(res.statusCode).toBe(422);
    expect(h.calls).toHaveLength(0);
  });

  it('validation errors never echo the submitted value', async () => {
    const h = harness();
    const res = await h.app.inject({ method: 'POST', url: '/api/ring/connect', payload: { token: 'short-secret' } });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('short-secret');
  });
});

describe('live check workflow over HTTP', () => {
  it('refuses PASS on a Ring check before a session is observed', async () => {
    const h = harness();
    const { runId, ringCheckId } = await liveRun(h);
    const started = (
      await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` })
    ).json();
    const attempt = started.checks.find((c: { id: string }) => c.id === ringCheckId).latestAttempt;

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/attempts/${attempt.id}/decision`,
      payload: { decision: 'PASS' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('RING_EVIDENCE_REQUIRED');
  });

  it('syncs, claims the session, and then allows PASS', async () => {
    const h = harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` });
    const sessionStart = h.clock.now.getTime() + 20_000;
    advance(h, 60);

    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: true, reported_at: '2026-10-08T09:00:30Z' } } } }
        : { body: syntheticPage([{ id: 'live-session-1', startMs: sessionStart, deviceId: DEVICE_A }], null) },
    );
    const sync = await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/sync` });
    expect(sync.statusCode).toBe(200);
    expect(sync.json().sync.sessionClaimed).toBe(true);
    // Sync never touched a media endpoint.
    expect(h.calls.some((url) => url.includes('/media/'))).toBe(false);

    const attempt = sync.json().run.checks.find((c: { id: string }) => c.id === ringCheckId).latestAttempt;
    expect(attempt.evidence.label).toBe('Ring session observed during this check window');

    const pass = await h.app.inject({
      method: 'POST',
      url: `/api/attempts/${attempt.id}/decision`,
      payload: { decision: 'PASS' },
    });
    expect(pass.statusCode).toBe(200);
  });

  it('turns a sync failure into RECONNECT_REQUIRED and nothing else', async () => {
    const h = harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` });
    advance(h, 900);

    h.setRoute(() => ({ status: 401, body: '' }));
    const res = await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/sync` });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/not evidence about the site/i);

    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json();
    expect(run.readiness.integrationState).toBe('RECONNECT_REQUIRED');
    expect(run.readiness.status).not.toBe('BLOCKED');
    expect(run.incidents).toHaveLength(0);
  });

  it('a validation-style 403 does not raise the reconnect overlay', async () => {
    const h = harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` });

    h.setRoute(() => ({
      status: 403,
      body: { errors: [{ status: '403', code: 'TIME_RANGE_NOT_AUTHORIZED', detail: 'out of bounds' }] },
    }));
    const res = await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/sync` });

    expect(res.statusCode).toBe(500);
    expect(res.json().setsReconnectOverlay).toBe(false);
    const run = (await h.app.inject({ method: 'GET', url: `/api/runs/${runId}` })).json();
    expect(run.readiness.integrationState).toBe('HEALTHY');
  });

  it('the measured Day-1 offline device blocks a Ring check as soon as it starts', async () => {
    const h = harness();
    const { runId, ringCheckId } = await liveRun(h, { deviceOnline: false });
    const run = (await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` })).json();

    // sec. 12: CHECK_STARTED -> required device unavailable -> BLOCKED.
    expect(run.readiness.status).toBe('BLOCKED');
    expect(run.readiness.reasons[0].code).toBe('REQUIRED_DEVICE_UNAVAILABLE');
  });

  it('an offline device raises a BLOCKER coverage incident', async () => {
    const h = harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` });

    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: false, reported_at: '2026-10-08T09:00:00Z' } } } }
        : { body: { data: [] } },
    );
    const res = await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/sync` });
    const run = res.json().run;

    expect(run.readiness.status).toBe('BLOCKED');
    expect(run.incidents[0]).toMatchObject({ severity: 'BLOCKER', status: 'OPEN' });
  });

  it('runs the full fail -> recheck -> resolve -> approve path', async () => {
    const h = harness();
    const { runId, ringCheckId, manualCheckId } = await liveRun(h);

    // Ring check passes with evidence.
    await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/start` });
    const sessionStart = h.clock.now.getTime() + 10_000;
    advance(h, 30);
    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: true } } } }
        : { body: syntheticPage([{ id: 'sess', startMs: sessionStart, deviceId: DEVICE_A }], null) },
    );
    const synced = (await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${ringCheckId}/sync` })).json();
    const ringAttempt = synced.run.checks.find((c: { id: string }) => c.id === ringCheckId).latestAttempt;
    await h.app.inject({ method: 'POST', url: `/api/attempts/${ringAttempt.id}/decision`, payload: { decision: 'PASS' } });

    // Manual check fails, opening a HIGH incident.
    let run = (await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${manualCheckId}/start` })).json();
    let manual = run.checks.find((c: { id: string }) => c.id === manualCheckId).latestAttempt;
    run = (
      await h.app.inject({
        method: 'POST',
        url: `/api/attempts/${manual.id}/decision`,
        payload: { decision: 'FAIL', reason: 'Zone fault' },
      })
    ).json();
    expect(run.readiness.status).toBe('NOT_READY');
    const incidentId = run.incidents[0].id;
    expect(run.incidents[0]).toMatchObject({ severity: 'HIGH', status: 'OPEN' });

    // Recheck moves the incident to RECHECKING; PASS moves it to READY_TO_RESOLVE.
    run = (await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/checks/${manualCheckId}/start` })).json();
    expect(run.incidents[0].status).toBe('RECHECKING');
    manual = run.checks.find((c: { id: string }) => c.id === manualCheckId).latestAttempt;
    run = (
      await h.app.inject({ method: 'POST', url: `/api/attempts/${manual.id}/decision`, payload: { decision: 'PASS' } })
    ).json();
    expect(run.incidents[0].status).toBe('READY_TO_RESOLVE');

    // Not approvable until a person resolves the HIGH incident.
    expect((await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/approve` })).statusCode).toBe(409);
    await h.app.inject({
      method: 'POST',
      url: `/api/incidents/${incidentId}/transition`,
      payload: { to: 'RESOLVED', reason: 'Fault cleared and rechecked' },
    });

    const approved = await h.app.inject({ method: 'POST', url: `/api/runs/${runId}/approve` });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().readiness.status).toBe('READY');
  });
});

describe('evidence honesty in every response', () => {
  it('no run view or readiness explanation uses forbidden claims', async () => {
    const h = harness();
    seedReviewMode(h.db);
    const bodies = [
      (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}` })).body,
      (await h.app.inject({ method: 'GET', url: '/api/runs' })).body,
      (await h.app.inject({ method: 'GET', url: `/api/runs/${REVIEW_RUN_ID}/audit` })).body,
      (await h.app.inject({ method: 'GET', url: '/api/meta' })).body,
    ];
    for (const body of bodies) expect(body).not.toMatch(FORBIDDEN);
  });
});

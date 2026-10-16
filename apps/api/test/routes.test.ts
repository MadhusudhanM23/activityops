import { afterEach, describe, expect, it } from 'vitest';
import { REVIEW_RUN_ID, seedReviewMode } from '../src/seed/reviewMode.js';
import { DEVICE_A, realDeviceList, syntheticPage } from './fixtures/ring.js';
import { FAKE_TOKEN, type Harness, advance, makeHarness } from './helpers/http.js';

const FORBIDDEN = /person detected|motion detected|site is safe|site was clear|area is clear|verified safe|proven clear|four-eyes|manager sign-off/i;

let current: Harness | undefined;
async function harness(options?: Parameters<typeof makeHarness>[0]) {
  current = await makeHarness(options);
  return current;
}
afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

/** realDeviceList with the device reported online, to isolate other variables. */
const onlineDeviceList = {
  ...realDeviceList,
  included: realDeviceList.included.map((r) =>
    r.type === 'device-status' ? { ...r, attributes: { ...r.attributes, online: true } } : r,
  ),
};

const connect = (h: Harness, token = FAKE_TOKEN) =>
  h.call('POST', '/api/ring/connect', { token, noticeAcknowledged: true });

/**
 * Connects and creates a live run. Defaults to an ONLINE device; the measured
 * Day-1 device was offline, which is its own test case below.
 */
async function liveRun(h: Harness, options: { deviceOnline?: boolean } = {}) {
  h.setRoute(() => ({ body: options.deviceOnline === false ? realDeviceList : onlineDeviceList }));
  const connected = await connect(h);
  expect(connected.statusCode).toBe(200);
  const created = await h.call('POST', '/api/runs', { templateId: connected.json().templateId });
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
    const h = await harness();
    seedReviewMode(h.db);
    const res = await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`);
    const run = res.json();

    expect(res.statusCode).toBe(200);
    expect(run.dataMode).toBe('RECORDED_DEMO');
    expect(run.dataModeLabel).toBe('RECORDED DEMO - Ring Playground capture: 2026-10-07');
    expect(run.readiness.status).toBe('READY');
  });

  it('shows the captured session as evidence, with its limits', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const run = (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`)).json();
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
    const h = await harness();
    seedReviewMode(h.db);
    const run = (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`)).json();
    const alarm = run.checks.find((c: { label: string }) => c.label.startsWith('Alarm panel'));

    expect(alarm.attempts.map((a: { status: string }) => a.status)).toEqual(['FAIL', 'PASS']);
    expect(alarm.attempts[1].supersedesAttemptId).toBe(alarm.attempts[0].id);
  });

  it('shows an override as OVERRIDDEN, never as PASS', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const run = (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`)).json();
    const notes = run.checks.find((c: { label: string }) => c.label.startsWith('Previous shift'));

    expect(notes.latestAttempt.status).toBe('OVERRIDDEN');
    expect(notes.latestAttempt.statusLabel).not.toMatch(/pass/i);
    expect(notes.latestAttempt.override.reason).toMatch(/confirmed by phone/);
  });

  it('records the incident lifecycle through to human resolution', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const run = (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`)).json();
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
    const h = await harness();
    seedReviewMode(h.db);
    const run = (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`)).json();
    const ring = run.checks[0];

    for (const url of [
      `/api/runs/${REVIEW_RUN_ID}/checks/${ring.id}/start`,
      `/api/runs/${REVIEW_RUN_ID}/checks/${ring.id}/sync`,
      `/api/runs/${REVIEW_RUN_ID}/cancel`,
    ]) {
      const res = await h.call('POST', url);
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toMatch(/recorded demo run/i);
    }
  });

  it('refuses incident transitions on the recorded run at the API, not just in the UI', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    // Every seeded incident is already closed, so a transition on one would fail on
    // the lifecycle rule alone. Plant an OPEN incident so only the guard can stop it.
    h.db
      .prepare(
        "INSERT INTO incident (id, check_id, run_id, severity, status, reason, created_at) VALUES ('planted', 'check-recorded-float', ?, 'HIGH', 'OPEN', 'planted', ?)",
      )
      .run(REVIEW_RUN_ID, new Date().toISOString());

    const res = await h.call('POST', '/api/incidents/planted/transition', { to: 'ACKNOWLEDGED' });
    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/recorded demo run/i);
  });

  it('does not offer the recorded template for new runs, and refuses it if asked', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const templates = (await h.call('GET', '/api/templates')).json();
    expect(templates.map((t: { id: string }) => t.id)).not.toContain('template-recorded-opening');

    const res = await h.call('POST', '/api/runs', { templateId: 'template-recorded-opening' });
    expect(res.statusCode).toBe(404);
  });

  it('produces an audit trail for every accountable action', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const audit = (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}/audit`)).json();
    const actions = audit.map((a: { action: string }) => a.action);

    for (const expected of ['START_ATTEMPT', 'CLAIM_EVIDENCE', 'PASS', 'FAIL', 'RECHECK', 'OVERRIDE', 'DISMISS', 'APPROVE']) {
      expect(actions).toContain(expected);
    }
  });
});

describe('Live Test Mode connection (spec sec. 16, 19, 24)', () => {
  it('discovers devices dynamically and never echoes the token', async () => {
    const h = await harness();
    const res = await connect(h);

    expect(res.statusCode).toBe(200);
    expect(res.json().devicesDiscovered).toBe(1);
    expect(res.body).not.toContain(FAKE_TOKEN);
    expect((await h.call('GET', '/api/meta')).body).not.toContain(FAKE_TOKEN);
    expect((await h.call('GET', '/api/ring/status')).body).not.toContain(FAKE_TOKEN);
  });

  it('requires the data-practices notice to be acknowledged first', async () => {
    const h = await harness();
    const res = await h.call('POST', '/api/ring/connect', { token: FAKE_TOKEN });
    expect(res.statusCode).toBe(400);
    expect(h.calls).toHaveLength(0); // Ring was never contacted
  });

  it('never writes the token to SQLite', async () => {
    const h = await harness();
    await connect(h);

    const tables = h.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    for (const { name } of tables) {
      const dump = JSON.stringify(h.db.prepare(`SELECT * FROM "${name}"`).all());
      expect(dump).not.toContain(FAKE_TOKEN);
    }
  });

  it('drops a token Ring rejects', async () => {
    const h = await harness();
    h.setRoute(() => ({ status: 401, body: '' }));
    const res = await connect(h);

    expect(res.statusCode).toBe(409);
    const status = (await h.call('GET', '/api/ring/status')).json();
    expect(status.connected).toBe(false);
    expect(status.integrationState).toBe('RECONNECT_REQUIRED');
  });

  it('rejects an already-expired token without calling Ring', async () => {
    const h = await harness();
    const expired = ['eyJhbGciOiJub25lIn0', Buffer.from(JSON.stringify({ exp: 1000 })).toString('base64url'), 'c2ln'].join('.');
    const res = await connect(h, expired);

    expect(res.statusCode).toBe(422);
    expect(h.calls).toHaveLength(0);
  });

  it('validation errors never echo the submitted value', async () => {
    const h = await harness();
    const res = await h.call('POST', '/api/ring/connect', { token: 'short-secret', noticeAcknowledged: true });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('short-secret');
  });
});

describe('live check workflow over HTTP', () => {
  it('refuses PASS on a Ring check before a session is observed', async () => {
    const h = await harness();
    const { runId, ringCheckId } = await liveRun(h);
    const started = (await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`)).json();
    const attempt = started.checks.find((c: { id: string }) => c.id === ringCheckId).latestAttempt;

    const res = await h.call('POST', `/api/attempts/${attempt.id}/decision`, { decision: 'PASS' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('RING_EVIDENCE_REQUIRED');
  });

  it('syncs, claims the session, and then allows PASS', async () => {
    const h = await harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`);
    const sessionStart = h.clock.now.getTime() + 20_000;
    advance(h, 60);

    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: true, reported_at: '2026-10-08T09:00:30Z' } } } }
        : { body: syntheticPage([{ id: 'live-session-1', startMs: sessionStart, deviceId: DEVICE_A }], null) },
    );
    const sync = await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/sync`);
    expect(sync.statusCode).toBe(200);
    expect(sync.json().sync.sessionClaimed).toBe(true);
    // Sync never touched a media endpoint.
    expect(h.calls.some((url) => url.includes('/media/'))).toBe(false);

    const attempt = sync.json().run.checks.find((c: { id: string }) => c.id === ringCheckId).latestAttempt;
    expect(attempt.evidence.label).toBe('Ring session observed during this check window');

    const pass = await h.call('POST', `/api/attempts/${attempt.id}/decision`, { decision: 'PASS' });
    expect(pass.statusCode).toBe(200);
  });

  it('turns a sync failure into RECONNECT_REQUIRED and nothing else', async () => {
    const h = await harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`);
    advance(h, 900);

    h.setRoute(() => ({ status: 401, body: '' }));
    const res = await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/sync`);

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toMatch(/not evidence about the site/i);

    const run = (await h.call('GET', `/api/runs/${runId}`)).json();
    expect(run.readiness.integrationState).toBe('RECONNECT_REQUIRED');
    expect(run.readiness.status).not.toBe('BLOCKED');
    expect(run.incidents).toHaveLength(0);
  });

  it('a validation-style 403 does not raise the reconnect overlay', async () => {
    const h = await harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`);

    h.setRoute(() => ({
      status: 403,
      body: { errors: [{ status: '403', code: 'TIME_RANGE_NOT_AUTHORIZED', detail: 'out of bounds' }] },
    }));
    const res = await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/sync`);

    expect(res.statusCode).toBe(500);
    expect(res.json().setsReconnectOverlay).toBe(false);
    const run = (await h.call('GET', `/api/runs/${runId}`)).json();
    expect(run.readiness.integrationState).toBe('HEALTHY');
  });

  it('the measured Day-1 offline device blocks a Ring check as soon as it starts', async () => {
    const h = await harness();
    const { runId, ringCheckId } = await liveRun(h, { deviceOnline: false });
    const run = (await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`)).json();

    // sec. 12: CHECK_STARTED -> required device unavailable -> BLOCKED.
    expect(run.readiness.status).toBe('BLOCKED');
    expect(run.readiness.reasons[0].code).toBe('REQUIRED_DEVICE_UNAVAILABLE');
  });

  it('an offline device raises a BLOCKER coverage incident', async () => {
    const h = await harness();
    const { runId, ringCheckId } = await liveRun(h);
    await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`);

    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: false, reported_at: '2026-10-08T09:00:00Z' } } } }
        : { body: { data: [] } },
    );
    const res = await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/sync`);
    const run = res.json().run;

    expect(run.readiness.status).toBe('BLOCKED');
    expect(run.incidents[0]).toMatchObject({ severity: 'BLOCKER', status: 'OPEN' });
  });

  it('a later run lists an open incident carried over from an earlier run of the same check', async () => {
    const h = await harness();
    const first = await liveRun(h);
    await h.call('POST', `/api/runs/${first.runId}/checks/${first.ringCheckId}/start`);
    const offline = (url: string) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: false, reported_at: '2026-10-08T09:00:00Z' } } } }
        : { body: { data: [] } };
    h.setRoute(offline);
    await h.call('POST', `/api/runs/${first.runId}/checks/${first.ringCheckId}/sync`);

    const templateId = 'template-live-opening';
    const second = (await h.call('POST', '/api/runs', { templateId })).json();
    await h.call('POST', `/api/runs/${second.id}/checks/${first.ringCheckId}/start`);
    h.setRoute(offline);
    const run = (await h.call('POST', `/api/runs/${second.id}/checks/${first.ringCheckId}/sync`)).json().run;

    // Readiness already counted the open incident; now the panel shows it too, labelled.
    expect(run.readiness.status).toBe('BLOCKED');
    expect(run.incidents).toHaveLength(1);
    expect(run.incidents[0]).toMatchObject({ severity: 'BLOCKER', status: 'OPEN', carriedOver: true });
    const firstRun = (await h.call('GET', `/api/runs/${first.runId}`)).json();
    expect(firstRun.incidents[0].carriedOver).toBe(false);
  });

  it("cancelling a run closes its untouched coverage incident under the canceller's name, so the next run is not blocked", async () => {
    const h = await harness();
    const first = await liveRun(h);
    await h.call('POST', `/api/runs/${first.runId}/checks/${first.ringCheckId}/start`);
    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: false, reported_at: '2026-10-08T09:00:00Z' } } } }
        : { body: { data: [] } },
    );
    const incidentId = (await h.call('POST', `/api/runs/${first.runId}/checks/${first.ringCheckId}/sync`)).json().run.incidents[0].id;

    expect((await h.call('POST', `/api/runs/${first.runId}/cancel`)).statusCode).toBe(200);

    const closed = h.db.prepare('SELECT status, dismissed_reason FROM incident WHERE id = ?').get(incidentId) as { status: string; dismissed_reason: string };
    expect(closed.status).toBe('DISMISSED');
    expect(closed.dismissed_reason).toMatch(/Run cancelled/);
    const action = h.db.prepare("SELECT actor FROM incident_action WHERE incident_id = ? AND action = 'DISMISSED'").get(incidentId) as { actor: string };
    expect(action.actor).toBe('demo.operator');

    const templateId = 'template-live-opening';
    const second = (await h.call('POST', '/api/runs', { templateId })).json();
    expect(second.incidents).toEqual([]);
    expect(second.readiness.reasons.some((r: { code: string }) => /INCIDENT/.test(r.code))).toBe(false);
  });

  it('connecting builds opening, closing and shift-handover checklists from the discovered devices', async () => {
    const h = await harness();
    await liveRun(h);
    const templates = (await h.call('GET', '/api/templates')).json() as { id: string; name: string; checkCount: number }[];
    expect(templates.map((t) => t.id).sort()).toEqual(['template-live-closing', 'template-live-handover', 'template-live-opening']);
    const closing = (await h.call('POST', '/api/runs', { templateId: 'template-live-closing' })).json();
    expect(closing.triggerType).toBe('CLOSING');
    expect(closing.checks.filter((c: { requirementType: string }) => c.requirementType === 'RING_REQUIRED').length).toBeGreaterThan(0);
    expect(closing.checks.map((c: { label: string }) => c.label)).toContain('Alarm armed and all zones set');
  });

  it('cancelling a run leaves an operator FAIL incident open - a site problem carries over', async () => {
    const h = await harness();
    const first = await liveRun(h);
    const started = (await h.call('POST', `/api/runs/${first.runId}/checks/${first.manualCheckId}/start`)).json();
    const attemptId = started.checks.find((c: { id: string }) => c.id === first.manualCheckId).latestAttempt.id;
    await h.call('POST', `/api/attempts/${attemptId}/decision`, { decision: 'FAIL', reason: 'Zone 3 fault' });

    await h.call('POST', `/api/runs/${first.runId}/cancel`);

    const templateId = 'template-live-opening';
    const second = (await h.call('POST', '/api/runs', { templateId })).json();
    expect(second.incidents).toHaveLength(1);
    expect(second.incidents[0]).toMatchObject({ status: 'OPEN', carriedOver: true });
  });

  it("dismissing a carried-over incident is recorded in the later run's audit trail", async () => {
    const h = await harness();
    const first = await liveRun(h);
    await h.call('POST', `/api/runs/${first.runId}/checks/${first.ringCheckId}/start`);
    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: false, reported_at: '2026-10-08T09:00:00Z' } } } }
        : { body: { data: [] } },
    );
    const incidentId = (await h.call('POST', `/api/runs/${first.runId}/checks/${first.ringCheckId}/sync`)).json().run.incidents[0].id;

    const templateId = 'template-live-opening';
    const second = (await h.call('POST', '/api/runs', { templateId })).json();
    await h.call('POST', `/api/runs/${second.id}/checks/${first.manualCheckId}/start`);
    advance(h, 5);
    const dismissed = await h.call('POST', `/api/incidents/${incidentId}/transition`, { to: 'DISMISSED', reason: 'Raised on a cancelled run' });
    expect(dismissed.statusCode).toBe(200);

    const audit = (await h.call('GET', `/api/runs/${second.id}/audit`)).json();
    expect(audit.some((e: { action: string; entityType?: string }) => /DISMISS/.test(e.action))).toBe(true);
  });

  it('runs the full fail -> recheck -> resolve -> approve path', async () => {
    const h = await harness();
    const { runId, ringCheckId, manualCheckId } = await liveRun(h);

    // Ring check passes with evidence.
    await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/start`);
    const sessionStart = h.clock.now.getTime() + 10_000;
    advance(h, 30);
    h.setRoute((url) =>
      url.includes('/status')
        ? { body: { data: { type: 'device-status', id: 's', attributes: { online: true } } } }
        : { body: syntheticPage([{ id: 'sess', startMs: sessionStart, deviceId: DEVICE_A }], null) },
    );
    const synced = (await h.call('POST', `/api/runs/${runId}/checks/${ringCheckId}/sync`)).json();
    const ringAttempt = synced.run.checks.find((c: { id: string }) => c.id === ringCheckId).latestAttempt;
    await h.call('POST', `/api/attempts/${ringAttempt.id}/decision`, { decision: 'PASS' });

    // Manual check fails, opening a HIGH incident.
    let run = (await h.call('POST', `/api/runs/${runId}/checks/${manualCheckId}/start`)).json();
    let manual = run.checks.find((c: { id: string }) => c.id === manualCheckId).latestAttempt;
    run = (await h.call('POST', `/api/attempts/${manual.id}/decision`, { decision: 'FAIL', reason: 'Zone fault' })).json();
    expect(run.readiness.status).toBe('NOT_READY');
    const incidentId = run.incidents[0].id;
    expect(run.incidents[0]).toMatchObject({ severity: 'HIGH', status: 'OPEN' });

    // Recheck moves the incident to RECHECKING; PASS moves it to READY_TO_RESOLVE.
    run = (await h.call('POST', `/api/runs/${runId}/checks/${manualCheckId}/start`)).json();
    expect(run.incidents[0].status).toBe('RECHECKING');
    manual = run.checks.find((c: { id: string }) => c.id === manualCheckId).latestAttempt;
    run = (await h.call('POST', `/api/attempts/${manual.id}/decision`, { decision: 'PASS' })).json();
    expect(run.incidents[0].status).toBe('READY_TO_RESOLVE');

    // Not approvable until a person resolves the HIGH incident.
    expect((await h.call('POST', `/api/runs/${runId}/approve`)).statusCode).toBe(409);
    await h.call('POST', `/api/incidents/${incidentId}/transition`, { to: 'RESOLVED', reason: 'Fault cleared and rechecked' });

    const approved = await h.call('POST', `/api/runs/${runId}/approve`);
    expect(approved.statusCode).toBe(200);
    expect(approved.json().readiness.status).toBe('READY');
  });
});

describe('evidence honesty in every response', () => {
  it('no run view or readiness explanation uses forbidden claims', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const bodies = [
      (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}`)).body,
      (await h.call('GET', '/api/runs')).body,
      (await h.call('GET', `/api/runs/${REVIEW_RUN_ID}/audit`)).body,
      (await h.call('GET', '/api/meta')).body,
      (await h.call('GET', '/api/privacy')).body,
    ];
    for (const body of bodies) expect(body).not.toMatch(FORBIDDEN);
  });
});

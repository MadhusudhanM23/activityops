import { Writable } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, DEV_DEMO_PASSWORD } from '../src/config.js';
import { REVIEW_RUN_ID, seedReviewMode } from '../src/seed/reviewMode.js';
import { realDeviceList } from './fixtures/ring.js';
import { FAKE_TOKEN, TEST_PASSWORD, type Harness, makeHarness, testSettings } from './helpers/http.js';

/** Spec v7 sec. 16, 19 and 24, tested over real HTTP. */

let current: Harness | undefined;
async function harness(options?: Parameters<typeof makeHarness>[0]) {
  current = await makeHarness(options);
  return current;
}
afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const login = (h: Harness, password = TEST_PASSWORD) =>
  h.anon('POST', '/api/session/login', { username: testSettings.credentials.username, password });

describe('authentication policy', () => {
  it('lets anyone read the public endpoints and the privacy notice', async () => {
    const h = await harness({ login: false });
    for (const url of ['/api/health', '/api/meta', '/api/session', '/api/privacy']) {
      expect((await h.anon('GET', url)).statusCode, url).toBe(200);
    }
  });

  it('lets an anonymous visitor read Review Mode - and only Review Mode', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    const created = await h.call('POST', '/api/runs', {
      templateId: (await h.call('POST', '/api/ring/connect', { token: FAKE_TOKEN, noticeAcknowledged: true })).json().templateId,
    });
    const liveId = created.json().id;

    expect((await h.anon('GET', `/api/runs/${REVIEW_RUN_ID}`)).statusCode).toBe(200);
    expect((await h.anon('GET', `/api/runs/${REVIEW_RUN_ID}/audit`)).statusCode).toBe(200);
    expect((await h.anon('GET', `/api/runs/${liveId}`)).statusCode).toBe(401);
    expect((await h.anon('GET', `/api/runs/${liveId}/audit`)).statusCode).toBe(401);

    const listed = (await h.anon('GET', '/api/runs')).json();
    expect(listed.map((r: { id: string }) => r.id)).toEqual([REVIEW_RUN_ID]);
    // Signed in, both are visible.
    expect((await h.call('GET', '/api/runs')).json()).toHaveLength(2);
  });

  it('refuses every state-changing route to an anonymous caller', async () => {
    const h = await harness({ login: false });
    for (const url of [
      '/api/runs',
      '/api/runs/x/approve',
      '/api/runs/x/cancel',
      '/api/runs/x/checks/y/start',
      '/api/runs/x/checks/y/sync',
      '/api/attempts/x/decision',
      '/api/incidents/x/transition',
      '/api/ring/connect',
      '/api/ring/disconnect',
      '/api/data/delete-all',
    ]) {
      const res = await h.anon('POST', url, {});
      expect(res.statusCode, url).toBe(401);
    }
    expect((await h.anon('GET', '/api/ring/status')).statusCode).toBe(401);
    expect((await h.anon('GET', '/api/templates')).statusCode).toBe(401);
  });
});

describe('sessions and cookies', () => {
  it('sets an httpOnly, SameSite=Strict session cookie and never returns the session id in the body', async () => {
    const h = await harness({ login: false });
    const res = await login(h);
    const cookie = res.cookies.find((c) => c.name === 'aops_session');

    expect(res.statusCode).toBe(200);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(res.body).not.toContain(cookie!.value);
  });

  it('rejects a wrong password and audits the failure without the attempted username', async () => {
    const h = await harness({ login: false });
    const res = await h.anon('POST', '/api/session/login', { username: 'my-actual-password', password: 'nope' });

    expect(res.statusCode).toBe(401);
    expect(res.cookies.find((c) => c.name === 'aops_session')).toBeUndefined();
    const audit = JSON.stringify(h.db.prepare("SELECT * FROM audit_log WHERE action = 'LOGIN_FAILED'").all());
    expect(audit).toContain('anonymous');
    expect(audit).not.toContain('my-actual-password');
  });

  it('rotates the session on login - a pre-login session id stops working', async () => {
    const h = await harness();
    const before = h.cookie;
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/session/login',
      payload: { username: testSettings.credentials.username, password: TEST_PASSWORD },
      headers: { cookie: before },
    });
    const after = `aops_session=${res.cookies.find((c) => c.name === 'aops_session')!.value}`;

    expect(after).not.toBe(before);
    const stale = await h.app.inject({ method: 'GET', url: '/api/templates', headers: { cookie: before } });
    expect(stale.statusCode).toBe(401);
  });

  it('logout ends the session', async () => {
    const h = await harness();
    await h.call('POST', '/api/session/logout');
    expect((await h.call('GET', '/api/templates')).statusCode).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('refuses a signed-in state change with no CSRF token', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/ring/disconnect',
      headers: { cookie: h.cookie },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('CSRF_FAILED');
  });

  it('refuses a wrong CSRF token', async () => {
    const h = await harness();
    const res = await h.app.inject({
      method: 'POST',
      url: '/api/ring/disconnect',
      headers: { cookie: h.cookie, 'x-csrf-token': `${h.csrf}x` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('accepts the right token', async () => {
    const h = await harness();
    expect((await h.call('POST', '/api/ring/disconnect')).statusCode).toBe(200);
  });
});

describe('rate limiting (spec sec. 24)', () => {
  it('limits login attempts and says when to retry', async () => {
    const h = await harness({ login: false });
    for (let i = 0; i < 10; i += 1) await login(h, 'wrong');
    const blocked = await login(h, 'wrong');

    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('a limited window recovers after it expires', async () => {
    const h = await harness({ login: false });
    for (let i = 0; i < 11; i += 1) await login(h, 'wrong');
    h.clock.now = new Date(h.clock.now.getTime() + 61_000);
    expect((await login(h)).statusCode).toBe(200);
  });

  it('limits Ring connect', async () => {
    const h = await harness();
    h.setRoute(() => ({ body: realDeviceList }));
    const statuses: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      statuses.push((await h.call('POST', '/api/ring/connect', { token: FAKE_TOKEN, noticeAcknowledged: true })).statusCode);
    }
    expect(statuses.slice(0, 6).every((s) => s === 200)).toBe(true);
    expect(statuses[6]).toBe(429);
  });
});

describe('response headers', () => {
  it('sets defensive headers and forbids caching API responses', async () => {
    const h = await harness({ login: false });
    const res = await h.anon('GET', '/api/health');

    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('secrets never reach the logs (spec sec. 20, 24)', () => {
  it('logs neither the Ring token, the password, the session id nor the CSRF token', async () => {
    let captured = '';
    const logStream = new Writable({
      write(chunk, _encoding, done) {
        captured += chunk.toString();
        done();
      },
    });
    const h = await harness({ logStream });
    await h.call('POST', '/api/ring/connect', { token: FAKE_TOKEN, noticeAcknowledged: true });
    await h.call('POST', '/api/ring/connect', { token: 'x', noticeAcknowledged: true }); // validation failure path

    expect(captured.length).toBeGreaterThan(0); // the logger really was capturing
    expect(captured).not.toContain(FAKE_TOKEN);
    expect(captured).not.toContain(TEST_PASSWORD);
    expect(captured).not.toContain(h.cookie.split('=')[1]);
    expect(captured).not.toContain(h.csrf);
  });
});

describe('Delete All Data (spec sec. 16)', () => {
  it('requires the typed confirmation', async () => {
    const h = await harness();
    const res = await h.call('POST', '/api/data/delete-all', { confirm: 'yes' });
    expect(res.statusCode).toBe(400);
  });

  it('removes live data and Ring facts, ends the Ring connection, keeps one deletion record, restores the demo', async () => {
    const h = await harness();
    seedReviewMode(h.db);
    await h.call('POST', '/api/ring/connect', { token: FAKE_TOKEN, noticeAcknowledged: true });
    const created = await h.call('POST', '/api/runs', { templateId: 'template-live-opening' });
    const liveId = created.json().id;

    const res = await h.call('POST', '/api/data/delete-all', { confirm: 'DELETE ALL DATA' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ deleted: true, ringDisconnected: true, recordedDemoRestored: true });

    // Live run, live device and discovered Ring facts are gone.
    expect((await h.call('GET', `/api/runs/${liveId}`)).statusCode).toBe(404);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM device WHERE site_id = 'site-live-playground'").get()).toEqual({ n: 0 });
    expect((await h.call('GET', '/api/ring/status')).json().connected).toBe(false);

    // The minimum deletion audit survives; earlier audit history does not.
    const deletions = h.db.prepare("SELECT actor, action FROM audit_log WHERE action = 'DELETE'").all();
    expect(deletions).toEqual([{ actor: 'demo.operator', action: 'DELETE' }]);
    expect(h.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'RING_CONNECT'").get()).toEqual({ n: 0 });

    // Review Mode still works for the next visitor.
    expect((await h.anon('GET', `/api/runs/${REVIEW_RUN_ID}`)).json().readiness.status).toBe('READY');
  });
});

describe('production configuration guard', () => {
  it('refuses to boot in production without a password', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DEMO_PASSWORD/);
  });

  it('refuses the development password in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DEMO_PASSWORD: DEV_DEMO_PASSWORD })).toThrow(/DEMO_PASSWORD/);
  });

  it('refuses a short password in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', DEMO_PASSWORD: 'short' })).toThrow(/DEMO_PASSWORD/);
  });

  it('turns on secure cookies and proxy trust by default in production', () => {
    const config = loadConfig({ NODE_ENV: 'production', DEMO_PASSWORD: 'a-long-enough-password' });
    expect(config.COOKIE_SECURE).toBe(true);
    expect(config.TRUST_PROXY).toBe(true);
  });

  it('keeps development convenient', () => {
    const config = loadConfig({ NODE_ENV: 'development' });
    expect(config.DEMO_PASSWORD).toBe(DEV_DEMO_PASSWORD);
    expect(config.COOKIE_SECURE).toBe(false);
  });
});

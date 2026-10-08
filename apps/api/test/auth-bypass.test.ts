import { afterEach, describe, expect, it } from 'vitest';
import { REVIEW_RUN_ID, seedReviewMode } from '../src/seed/reviewMode.js';
import { FAKE_TOKEN, type Harness, makeHarness } from './helpers/http.js';

/**
 * Non-canonical URL paths must not slip past the authentication policy.
 *
 * The router matches on the decoded path; a policy that inspects the raw URL can
 * disagree with it. Every variant below names a protected, state-changing
 * endpoint. None of them may reach a handler anonymously.
 */

let current: Harness | undefined;
afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const VARIANTS = [
  '/%61pi/data/delete-all', // percent-encoded letter
  '/%2561pi/data/delete-all', // double-encoded
  '/API/data/delete-all', // case
  '//api/data/delete-all', // doubled slash
  '/./api/data/delete-all', // dot segment
  '/x/../api/data/delete-all', // traversal segment
  '/api/data/delete-all/', // trailing slash
  '/api%2Fdata%2Fdelete-all', // encoded separators
  '/api/data/delete-all;x', // matrix parameter
  '/api/data/delete-all?', // empty query
];

describe('authentication cannot be bypassed with non-canonical paths', () => {
  for (const url of VARIANTS) {
    it(`anonymous ${url} never runs Delete All Data`, async () => {
      current = await makeHarness({ login: false });
      seedReviewMode(current.db);

      const res = await current.anon('POST', url, { confirm: 'DELETE ALL DATA' });

      // Whatever the status, the handler must not have run.
      expect(res.statusCode, res.body).not.toBe(200);
      const deletions = current.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'DELETE'").get();
      expect(deletions).toEqual({ n: 0 });
      expect((await current.anon('GET', `/api/runs/${REVIEW_RUN_ID}`)).statusCode).toBe(200);
    });
  }

  // These GET routes leaked to anonymous callers before the policy moved to the
  // matched route (L-21). Each must now refuse.
  for (const url of ['/%61pi/templates', '/%61pi/devices', '/%61pi/incidents', '/%61pi/ring/status', '/a%70i/incidents']) {
    it(`anonymous GET ${url} is refused`, async () => {
      current = await makeHarness({ login: false });
      const res = await current.anon('GET', url);
      expect(res.statusCode, res.body).toBe(401);
    });
  }

  it('an encoded path cannot disconnect a signed-in operator’s Ring session', async () => {
    current = await makeHarness();
    await current.call('POST', '/api/ring/connect', { token: FAKE_TOKEN, noticeAcknowledged: true });
    expect((await current.call('GET', '/api/ring/status')).json().connected).toBe(true);

    const attack = await current.anon('POST', '/%61pi/ring/disconnect');

    expect(attack.statusCode).toBe(401);
    expect((await current.call('GET', '/api/ring/status')).json().connected).toBe(true);
  });

  it('an encoded path still needs the CSRF token when signed in', async () => {
    current = await makeHarness();
    const res = await current.app.inject({
      method: 'POST',
      url: '/%61pi/ring/disconnect',
      headers: { cookie: current.cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

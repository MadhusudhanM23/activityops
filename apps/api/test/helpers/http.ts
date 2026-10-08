import { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { buildApp } from '../../src/app.js';
import { migrate } from '../../src/db/migrate.js';
import type { HttpSettings } from '../../src/http/context.js';
import type { ModelClient } from '../../src/ai/agent.js';
import { RingClient } from '../../src/ring/client.js';
import { RingTokenStore } from '../../src/ring/tokenStore.js';
import { realDeviceList, stubFetch } from '../fixtures/ring.js';

/**
 * HTTP test harness. The Ring provider is a stub serving the measured Day-1
 * shapes; every other layer - security hooks, routes, workflow, domain, SQLite
 * triggers - is the real thing.
 */

export const TEST_PASSWORD = 'test-password-not-a-secret';

export const testSettings: HttpSettings = {
  credentials: { username: 'demo.operator', password: TEST_PASSWORD },
  cookieSecure: false,
  trustProxy: false,
  timing: {
    clockSkewAllowanceSeconds: 30,
    sessionWindowSeconds: 600,
    demoSessionWindowSeconds: 300,
    postWindowObservationMarginSeconds: 60,
    historyPageCap: 10,
  },
};

// A syntactically valid JWT whose exp is far in the future. Not a real credential.
export const FAKE_TOKEN = [
  'eyJhbGciOiJub25lIn0',
  Buffer.from(JSON.stringify({ exp: 4102444800, scopes: ['ava.v1:read'] })).toString('base64url'),
  'c2lnbmF0dXJl',
].join('.');

type Route = (url: string) => { status?: number; body: unknown };

export interface Harness {
  app: FastifyInstance;
  db: DatabaseSync;
  clock: { now: Date };
  calls: string[];
  setRoute: (handler: Route) => void;
  /** Authenticated request carrying the session cookie and CSRF token. */
  call: (method: 'GET' | 'POST', url: string, payload?: unknown) => Promise<LightMyRequestResponse>;
  /** Anonymous request - no cookie, no CSRF token. */
  anon: (method: 'GET' | 'POST', url: string, payload?: unknown) => Promise<LightMyRequestResponse>;
  cookie: string;
  csrf: string;
}

export async function makeHarness(
  options: { login?: boolean; aiEnabled?: boolean; logStream?: NodeJS.WritableStream; model?: ModelClient } = {},
): Promise<Harness> {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  const clock = { now: new Date('2026-10-08T09:00:00.000Z') };
  let route: Route = () => ({ body: realDeviceList });
  const { impl, calls } = stubFetch((url) => route(url));
  const tokenStore = new RingTokenStore();

  const app = await buildApp({
    db,
    tokenStore,
    ringClient: new RingClient({ baseUrl: 'https://api.example.invalid', tokenProvider: tokenStore, fetchImpl: impl }),
    now: () => clock.now,
    settings: testSettings,
    model: options.model ?? null,
    ...(options.aiEnabled !== undefined ? { aiEnabled: options.aiEnabled } : {}),
    ...(options.logStream ? { logStream: options.logStream } : {}),
  });

  const harness: Harness = {
    app,
    db,
    clock,
    calls,
    cookie: '',
    csrf: '',
    setRoute: (handler) => {
      route = handler;
    },
    call: (method, url, payload) =>
      app.inject({
        method,
        url,
        payload: payload as never,
        headers: { cookie: harness.cookie, 'x-csrf-token': harness.csrf },
      }),
    anon: (method, url, payload) => app.inject({ method, url, payload: payload as never }),
  };

  if (options.login !== false) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/session/login',
      payload: { username: testSettings.credentials.username, password: TEST_PASSWORD },
    });
    const session = res.cookies.find((c) => c.name === 'aops_session');
    if (res.statusCode !== 200 || !session) throw new Error(`test login failed: ${res.statusCode} ${res.body}`);
    harness.cookie = `aops_session=${session.value}`;
    harness.csrf = res.json().csrfToken;
  }
  return harness;
}

export function advance(h: Harness, seconds: number): void {
  h.clock.now = new Date(h.clock.now.getTime() + seconds * 1000);
}

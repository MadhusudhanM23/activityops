import { describe, expect, it } from 'vitest';
import { classifyHttpError, RingError } from '../src/ring/errors.js';
import { RingClient } from '../src/ring/client.js';
import { stubFetch } from './fixtures/ring.js';

const BASE = 'https://api.example.invalid';
const token = { getToken: () => 'test-token' };

/** Error bodies in the exact envelope measured on Day-1. */
function providerError(code: string, detail: string) {
  return { errors: [{ id: 'req-1', status: '403', code, detail }] };
}

describe('error classification reads the provider code first (D-018)', () => {
  it('403 REQUEST_FORBIDDEN is a request bug, not a reconnect', () => {
    const error = classifyHttpError(
      403,
      providerError('REQUEST_FORBIDDEN', 'Cannot authorize: missing required timestamp fields in request body'),
    );
    expect(error.kind).toBe('REQUEST_INVALID');
    expect(error.setsReconnectOverlay).toBe(false);
  });

  it('403 TIME_RANGE_NOT_AUTHORIZED is a request bug, not a reconnect', () => {
    const error = classifyHttpError(
      403,
      providerError('TIME_RANGE_NOT_AUTHORIZED', 'Requested time range is not within authorized boundaries'),
    );
    expect(error.kind).toBe('REQUEST_INVALID');
    expect(error.setsReconnectOverlay).toBe(false);
  });

  it('an unrecognised 403 keeps the spec default and asks for a reconnect', () => {
    expect(classifyHttpError(403, providerError('SOMETHING_NEW', 'unknown')).kind).toBe(
      'RECONNECT_REQUIRED',
    );
  });

  it('401 with an empty body is a reconnect (measured in T1)', () => {
    const error = classifyHttpError(401, null);
    expect(error.kind).toBe('RECONNECT_REQUIRED');
    expect(error.setsReconnectOverlay).toBe(true);
  });

  it('429 is rate limiting, which raises the overlay', () => {
    expect(classifyHttpError(429, null).kind).toBe('RATE_LIMITED');
    expect(classifyHttpError(429, null).setsReconnectOverlay).toBe(true);
  });

  it('416 MEDIA_NOT_FOUND is not found, and never a reconnect', () => {
    const error = classifyHttpError(416, { errors: [{ code: 'MEDIA_NOT_FOUND', detail: 'No media found' }] });
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.setsReconnectOverlay).toBe(false);
  });

  it('5xx is transport', () => {
    expect(classifyHttpError(503, null).kind).toBe('TRANSPORT');
  });

  it('no provider error is ever negative site evidence', () => {
    for (const status of [401, 403, 404, 416, 429, 500, 503]) {
      expect(classifyHttpError(status, null).isNegativeSiteEvidence).toBe(false);
    }
  });
});

describe('client safety', () => {
  it('refuses to run without a connected session', async () => {
    const client = new RingClient({ baseUrl: BASE, tokenProvider: { getToken: () => null } });
    await expect(client.get('/v1/devices')).rejects.toMatchObject({ kind: 'RECONNECT_REQUIRED' });
  });

  it('sends the bearer token and never returns it', async () => {
    let seenAuth: string | null = null;
    const impl = (async (url: string, init: RequestInit) => {
      seenAuth = new Headers(init.headers).get('authorization');
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const client = new RingClient({ baseUrl: BASE, tokenProvider: token, fetchImpl: impl });
    const result = await client.get('/v1/devices');
    expect(seenAuth).toBe('Bearer test-token');
    expect(JSON.stringify(result)).not.toContain('test-token');
  });

  it('refuses to follow a provider link to another origin', () => {
    const client = new RingClient({ baseUrl: BASE, tokenProvider: token });
    expect(() => client.resolveUrl('https://evil.example.invalid/v1/history')).toThrowError(RingError);
  });

  it('resolves a relative links.next against the configured base', () => {
    const client = new RingClient({ baseUrl: BASE, tokenProvider: token });
    expect(client.resolveUrl('/v1/history?page=2')).toBe(`${BASE}/v1/history?page=2`);
  });

  it('treats a non-JSON success response as malformed', async () => {
    const { impl } = stubFetch(() => ({ body: 'not json at all' }));
    const client = new RingClient({ baseUrl: BASE, tokenProvider: token, fetchImpl: impl });
    await expect(client.get('/v1/devices')).rejects.toMatchObject({ kind: 'MALFORMED_RESPONSE' });
  });

  it('records the HTTP Date offset as diagnostics only', async () => {
    const { impl } = stubFetch(() => ({
      body: { data: [] },
      headers: { date: new Date(Date.now() + 5000).toUTCString() },
    }));
    const client = new RingClient({ baseUrl: BASE, tokenProvider: token, fetchImpl: impl });
    const result = await client.get('/v1/devices');
    expect(result.clockOffsetMs).toBeGreaterThan(3000);
  });

  it('still sends the server-side event_types filter even though it is ignored', () => {
    const client = new RingClient({ baseUrl: BASE, tokenProvider: token });
    expect(client.historyPath('dev-1')).toContain('event_types=on_demand');
  });
});

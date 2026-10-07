import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('health route', () => {
  it('reports integration state separately from readiness', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', integrationState: 'HEALTHY' });
    await app.close();
  });
});

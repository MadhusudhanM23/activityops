import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { testSettings } from './helpers/http.js';

/**
 * Production static serving (one process serves the API and the built
 * frontend). Exercised against a real directory because the unit suite
 * otherwise never sets WEB_DIST_PATH - and a major upgrade of the static
 * plugin could break it silently.
 */

let app: FastifyInstance | undefined;
let dir: string | undefined;

afterEach(async () => {
  await app?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  app = undefined;
  dir = undefined;
});

async function serve() {
  dir = mkdtempSync(join(tmpdir(), 'aops-dist-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>ActivityOps</title><div id="root"></div>');
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("app");');
  app = await buildApp({ settings: { ...testSettings, webDistPath: dir } });
  return app;
}

describe('static frontend serving', () => {
  it('serves index.html at the root', async () => {
    const res = await (await serve()).inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('<div id="root">');
  });

  it('serves built assets with a JavaScript content type', async () => {
    const res = await (await serve()).inject({ method: 'GET', url: '/assets/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
  });

  it('falls back to index.html for unknown non-API paths', async () => {
    const res = await (await serve()).inject({ method: 'GET', url: '/some/client/route' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<div id="root">');
  });

  it('answers an unknown API path with JSON, never the HTML shell', async () => {
    const res = await (await serve()).inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('refuses path traversal out of the dist directory', async () => {
    const instance = await serve();
    for (const url of ['/../package.json', '/assets/../../package.json', '/%2e%2e/package.json', '/assets/%2e%2e%2f%2e%2e%2fpackage.json']) {
      const res = await instance.inject({ method: 'GET', url });
      expect(res.body, url).not.toContain('"name"');
    }
  });

  it('applies the security headers to static responses too', async () => {
    const res = await (await serve()).inject({ method: 'GET', url: '/' });
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('refuses to start when the dist directory has no index.html', async () => {
    dir = mkdtempSync(join(tmpdir(), 'aops-empty-'));
    await expect(buildApp({ settings: { ...testSettings, webDistPath: dir } })).rejects.toThrow(/index\.html/);
  });
});

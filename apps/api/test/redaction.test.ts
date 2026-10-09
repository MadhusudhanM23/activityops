import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Evidence redaction (spec v7 sec. 22) - the script that makes raw Ring captures
 * safe to commit. Run as the real CLI, the way it is used.
 */

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'redact.mjs');

let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

function redact(payload: unknown): string {
  dir = mkdtempSync(join(tmpdir(), 'aops-redact-'));
  const input = join(dir, 'raw.json');
  const output = join(dir, 'out.json');
  writeFileSync(input, JSON.stringify(payload));
  execFileSync(process.execPath, [SCRIPT, input, output], { stdio: 'pipe' });
  return readFileSync(output, 'utf8');
}

// Synthetic, but shaped exactly like a real provider id (never commit a real one).
const REAL_DEVICE = 'ava1.ring.device.SYNTHETIC00000000000000000000000000000000000000000000REDACTIONTEST';
// Unsigned (alg "none") so the secret scanner recognises it as synthetic; the
// redactor must still strip it, because it removes every JWT-shaped string.
const JWT = 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4eXoifQ.c2lnbmF0dXJlc2lnbmF0dXJl';

describe('scripts/redact.mjs', () => {
  it('destroys tokens and secret-named fields', () => {
    const out = redact({ access_token: 'secret-value', refresh_token: 'r', nested: { Authorization: 'Bearer abc.def' } });
    expect(out).not.toMatch(/secret-value|abc\.def/);
    expect(out).toContain('REDACTED');
  });

  it('removes a JWT found anywhere in a string', () => {
    expect(redact({ note: `token was ${JWT} here` })).not.toContain(JWT);
  });

  it('aliases identifier fields consistently, so relationships survive', () => {
    const out = JSON.parse(redact({ a: { device_id: REAL_DEVICE }, b: { device_id: REAL_DEVICE } }));
    expect(out.a.device_id).not.toContain('ava1.ring');
    expect(out.a.device_id).toBe(out.b.device_id);
  });

  it('removes provider ids embedded inside URLs (the Phase 1 leak, L-15)', () => {
    const out = redact({ links: { related: `/v1/devices/${REAL_DEVICE}/capabilities` }, next: `https://api.amazonvision.com/v1/history/devices/${REAL_DEVICE}/events?access_token=abc` });
    expect(out).not.toContain(REAL_DEVICE);
    expect(out).not.toContain('access_token=abc');
  });

  it('refuses non-JSON input rather than writing it through', () => {
    dir = mkdtempSync(join(tmpdir(), 'aops-redact-'));
    const input = join(dir, 'raw.json');
    writeFileSync(input, 'not json');
    expect(() => execFileSync(process.execPath, [SCRIPT, input, join(dir, 'out.json')], { stdio: 'pipe' })).toThrow();
  });
});

describe('raw captures stay out of git', () => {
  it.each(['evidence/day-1/raw/T2-devices.json', '.env', '.env.production', 'data/activityops.sqlite'])('%s is ignored', (path) => {
    // `git check-ignore` exits 0 when the path is ignored.
    expect(() => execFileSync('git', ['check-ignore', '-q', path], { cwd: ROOT, stdio: 'pipe' })).not.toThrow();
  });

  it('.env.example is NOT ignored (it is meant to be committed)', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', '.env.example'], { cwd: ROOT, stdio: 'pipe' })).toThrow();
  });
});

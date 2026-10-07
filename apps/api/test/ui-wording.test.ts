import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Evidence-honesty gate over the frontend source (spec sec. 1, 5, 10, 14).
 *
 * The product must never upgrade a Ring session record into a claim about what
 * was seen, and must not imply two-person control while there is one login.
 * This turns the rule into a build failure instead of a review comment.
 */

const WEB_SRC = fileURLToPath(new URL('../../web/src', import.meta.url));

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /person detected/i, why: 'on_demand is a session record, never person detection' },
  { pattern: /motion detected/i, why: 'on_demand is a session record, never motion detection' },
  { pattern: /\bsite (is|was) (safe|clear|secure)\b/i, why: 'Ring evidence never proves the site state' },
  { pattern: /\barea is clear\b/i, why: 'a live-view session does not establish the area is clear' },
  { pattern: /verified safe|proven clear|resolution verified/i, why: 'forbidden claim (build brief sec. 10)' },
  { pattern: /four-eyes|manager sign-off|two-person/i, why: 'single login - no two-person governance language' },
];

/**
 * Real use of browser storage (`localStorage.setItem`, `window.sessionStorage[...]`).
 * Deliberately does not match prose such as "No localStorage, no URL parameters",
 * which is how the rule itself is documented in the source.
 */
const STORAGE_USE = /\b(localStorage|sessionStorage)\s*[.[]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css|html)$/.test(name) ? [path] : [];
  });
}

describe('frontend wording', () => {
  const files = sourceFiles(WEB_SRC);

  it('finds the frontend source to scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const { pattern, why } of FORBIDDEN) {
    it(`never says ${pattern} (${why})`, () => {
      const offenders = files.filter((file) => pattern.test(readFileSync(file, 'utf8')));
      expect(offenders).toEqual([]);
    });
  }

  it('labels the Ring token input as a password field and never persists it', () => {
    const connect = readFileSync(join(WEB_SRC, 'views', 'RingConnect.tsx'), 'utf8');
    expect(connect).toMatch(/type="password"/);
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(STORAGE_USE);
    }
  });

  it('the storage check catches real use and ignores documentation', () => {
    expect("localStorage.setItem('t', token)").toMatch(STORAGE_USE);
    expect('window.sessionStorage["t"] = token').toMatch(STORAGE_USE);
    expect('localStorage .getItem("t")').toMatch(STORAGE_USE);
    expect('// No localStorage, no URL parameters').not.toMatch(STORAGE_USE);
  });
});

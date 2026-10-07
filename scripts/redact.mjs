#!/usr/bin/env node
/**
 * Redacts a raw Ring capture so it can be committed as public evidence.
 *
 * Spec v7 sec. 22: public repository fixtures must contain no access tokens,
 * refresh tokens, AWS credentials, unnecessary account ids, real user
 * identifiers, or real device ids.
 *
 * Usage: node scripts/redact.mjs evidence/day-1/raw/T2-devices.json [out.json]
 *
 * Identifier values are replaced with a stable synthetic alias, so relationships
 * between records survive redaction while the real values do not.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';

/** Keys whose value is destroyed outright. */
const SECRET_KEYS = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /credential/i,
  /refresh/i,
  /signature/i,
  /^key$/i,
];

/** Keys whose value is replaced by a stable alias (relationships preserved). */
const IDENTIFIER_KEYS = [
  /device_id/i,
  /^id$/i,
  /user_id/i,
  /account_id/i,
  /owner/i,
  /location_id/i,
  /email/i,
  /phone/i,
  /address/i,
  /serial/i,
  /^lat$|^lng$|^latitude$|^longitude$/i,
];

const aliases = new Map();

function alias(prefix, value) {
  const key = `${prefix}:${String(value)}`;
  if (!aliases.has(key)) {
    const digest = createHash('sha256').update(key).digest('hex').slice(0, 8);
    aliases.set(key, `${prefix}_${digest}`);
  }
  return aliases.get(key);
}

function matches(patterns, key) {
  return patterns.some((p) => p.test(key));
}

/** Strips bearer tokens and long opaque blobs that appear inside URLs. */
function redactUrl(value) {
  return value
    .replace(/([?&](?:access_token|token|auth|signature|sig|key)=)[^&#]*/gi, '$1REDACTED')
    .replace(/\bBearer\s+[\w.\-]+/gi, 'Bearer REDACTED');
}

function walk(node, keyName = '') {
  if (Array.isArray(node)) return node.map((item) => walk(item, keyName));

  if (node && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (matches(SECRET_KEYS, key)) {
        out[key] = 'REDACTED';
      } else if (matches(IDENTIFIER_KEYS, key) && (typeof value === 'string' || typeof value === 'number')) {
        out[key] = alias(key.toLowerCase().replace(/[^a-z]/g, '') || 'id', value);
      } else {
        out[key] = walk(value, key);
      }
    }
    return out;
  }

  if (typeof node === 'string') {
    let v = redactUrl(node);
    // A JWT-shaped string anywhere in the payload is treated as a secret.
    v = v.replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, 'REDACTED_JWT');
    // Provider opaque identifiers also appear inside link URLs, where no key name
    // gives them away. Alias them wherever they occur so related records stay
    // linkable without exposing the real device/event ids.
    v = v.replace(/\bava\d+\.ring\.[a-z.]*[A-Z0-9]{16,}/g, (match) => alias('provider', match));
    return v;
  }

  return node;
}

const [input, output] = process.argv.slice(2);
if (!input) {
  console.error('usage: node scripts/redact.mjs <raw.json> [out.json]');
  process.exit(2);
}

const raw = readFileSync(input, 'utf8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error(`${input} is not valid JSON. Redact it by hand rather than committing it.`);
  process.exit(1);
}

const target = output ?? `evidence/day-1/${basename(input).replace(/\.json$/, '')}-redacted.json`;
writeFileSync(target, `${JSON.stringify(walk(parsed), null, 2)}\n`);
console.log(`wrote ${target} (${aliases.size} identifier(s) aliased)`);
console.log('Review the output by eye before committing. This script is a safety net, not a guarantee.');

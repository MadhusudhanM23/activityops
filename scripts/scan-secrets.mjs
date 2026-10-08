#!/usr/bin/env node
/**
 * Secret scan for the repository (spec v7 sec. 22, 24, 31).
 *
 *   node scripts/scan-secrets.mjs            # tracked files
 *   node scripts/scan-secrets.mjs --history  # tracked files + every commit
 *
 * Tuned to the credentials this project actually handles: Ring OAuth JWTs,
 * GitHub tokens, AWS keys, private keys, and real Ring provider device ids.
 * Deliberately synthetic test values (JWTs with alg "none", ids marked
 * SYNTHETIC/FAKE) are recognised and allowed, so the scan stays quiet enough to
 * be trusted when it does fire.
 *
 * Exits 1 on any finding. Prints locations only - never the matched secret.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const RULES = [
  { name: 'GitHub token', pattern: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g },
  { name: 'AWS access key id', pattern: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: 'AWS secret access key', pattern: /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{40}/gi },
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { name: 'Ring provider id', pattern: /\bava1\.ring\.(device|history\.event|account|client)\.[A-Z0-9]{40,}\b/g },
];

/** Values that are synthetic by construction and safe to commit. */
function isSynthetic(rule, match) {
  if (rule === 'JWT') {
    try {
      const header = JSON.parse(Buffer.from(match.split('.')[0], 'base64url').toString('utf8'));
      return header.alg === 'none'; // unsigned test tokens only
    } catch {
      return false;
    }
  }
  if (rule === 'Ring provider id') return /SYNTHETIC|FAKE/.test(match);
  return false;
}

function scanText(text, where, findings) {
  for (const { name, pattern } of RULES) {
    for (const match of text.matchAll(pattern)) {
      if (isSynthetic(name, match[0])) continue;
      findings.push({ rule: name, where, preview: `${match[0].slice(0, 6)}… (${match[0].length} chars)` });
    }
  }
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
const findings = [];

const files = git('ls-files').split('\n').filter(Boolean);
for (const file of files) {
  if (/\.(png|jpg|jpeg|gif|ico|pdf|woff2?)$/i.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  scanText(text, file, findings);
}

if (process.argv.includes('--history')) {
  const commits = git('rev-list', '--all').split('\n').filter(Boolean);
  for (const commit of commits) {
    scanText(git('show', '--format=%B', '--no-color', commit), `commit ${commit.slice(0, 8)}`, findings);
  }
  console.log(`scanned ${files.length} tracked files and ${commits.length} commits`);
} else {
  console.log(`scanned ${files.length} tracked files`);
}

if (findings.length > 0) {
  console.error(`\n${findings.length} potential secret(s) found:`);
  for (const f of findings) console.error(`  [${f.rule}] ${f.where}  ${f.preview}`);
  process.exit(1);
}
console.log('no secrets found');

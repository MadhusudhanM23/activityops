# Test results

## Automated and manual test log

| Date | Phase | Suite | Command / method | Passed | Failed | Notes |
|------|-------|-------|------------------|--------|--------|-------|
| 2026-10-07 | 0 | api smoke | `npm test` | 1 | 0 | Health route; integration state exposed separately from readiness |
| 2026-10-07 | 0 | api boot | `tsx src/server.ts` + curl | 1 | 0 | GET /api/health → 200. Bind failure later re-diagnosed as a port conflict (D-026, L-06) |
| 2026-10-07 | 0 | web build | `npm run build -w apps/web` | 1 | 0 | Vite production build succeeds |
| 2026-10-07 | 0 | sqlite | `PRAGMA journal_mode` | 1 | 0 | Returns `wal` |
| 2026-10-07 | 1 | Ring Playground T1-T8 | live API calls | 3 pass, 1 partial, 2 inconclusive / not reproduced, 2 blocked | — | Real provider calls. Verdict `DAY-1 GATE: PARTIAL`. See `INTEGRATION_FINDINGS.md` |
| 2026-10-07 | 2 | attempts + evidence gate | `npm test` | 19 | 0 | Session gating, sec. 8.4 window bounds, device/type/ambiguity binding, one-to-one claim, immutability triggers, override |
| 2026-10-07 | 2 | readiness precedence | `npm test` | 20 | 0 | Six precedence rules, integration overlay vs coverage, blocking severities, forbidden wording |
| 2026-10-07 | 2 | incident lifecycle | `npm test` | 14 | 0 | One open incident, escalation, illegal transitions, dismissal deadlock, approval/cancel, audit |
| 2026-10-07 | 2 | sync coverage gating | `npm test` | 8 | 0 | Case A vs Case B through the database; UNKNOWN device and integration failure proven non-blocking |
| 2026-10-07 | 3 | ring normalization | `npm test` | 14 | 0 | Measured JSON:API envelope, epoch-ms conversion, `relationships.source` binding, authoritative client-side filter |
| 2026-10-07 | 3 | ring error classification | `npm test` | 15 | 0 | Both measured 403 codes → REQUEST_INVALID; 401/429/5xx raise the overlay; no error is ever negative evidence |
| 2026-10-07 | 3 | ring history sync | `npm test` | 14 | 0 | Traversal, repeated-URL abort, page cap, idempotent upsert, two-condition coverage, real payload end to end |
| 2026-10-07 | 4 | HTTP routes | `npm test` | 21 | 0 | Review Mode, Live Test connect, token never echoed/persisted, fail → recheck → resolve → approve, sync failure isolation, recorded-run immutability |
| 2026-10-07 | 4 | frontend wording gate | `npm test` | 9 | 0 | Scans `apps/web/src` for forbidden claims and browser-storage use; scanner self-tests |
| 2026-10-07 | 4 | browser: Review Mode | headless Edge, 390px + 1280px | 6 shots | 0 | No horizontal overflow; 5 visual defects found and fixed (L-17) |
| 2026-10-07 | 4 | browser: live end to end | headless Edge + test-only fake Ring server | 1 flow | 0 | NOT_STARTED → PASS locked → unlocked after sync → FAIL → recheck → READY. 0 console errors, 0 media calls, token absent from logs |
| 2026-10-07 | 4 | built-artifact boot | `node dist/server.js` | 1 | 0 | **Initially FAILED** — `schema.sql` missing from `dist` (L-10). Fixed and re-verified |
| 2026-10-08 | 6 | HTTP routes (additions) | `npm test` | 2 | 0 | Notice acknowledgement required before connect; recorded template neither offered nor accepted for live runs (suite now 23) |
| 2026-10-08 | 6 | security | `npm test` | 22 | 0 | Auth policy, anonymous Review Mode only, cookie flags, session rotation, logout, CSRF, rate limits, headers, log hygiene, Delete All Data, production config guard |
| 2026-10-08 | 6 | auth bypass regression | `npm test` | 17 | 0 | Encoded, double-encoded, dot-segment, separator and matrix-param paths. **The pre-fix policy leaked protected GET routes** (L-21) |
| 2026-10-08 | 6 | static serving | `npm test` | 7 | 0 | Index, assets, SPA fallback, JSON 404 for `/api`, path traversal refused, headers, missing-dist guard |
| 2026-10-08 | 6 | mutation testing | scripted, 6 mutations | 6 caught | 0 missed | Removing CSRF, auth, live-run read guard, login rate limit, notice requirement, or logging the body each fails the suite |
| 2026-10-08 | 6 | secret scan | `scripts/scan-secrets.mjs --history` | 1 | 0 | 95 tracked files + 13 commits clean. Positive control: 3 of 3 fabricated secrets detected |
| 2026-10-08 | 6 | dependency audit | `npm audit --omit=dev` | 0 vulnerabilities | — | After upgrading `@fastify/static` 8 → 10.1.5 (HIGH) and Vitest 3 → 5 (critical, dev). 7 dev-only Tailwind 3 findings accepted (R-007) |
| 2026-10-08 | 6 | container: boot guard | `docker run` without `DEMO_PASSWORD` | 1 | 0 | Exits 1 with the configuration error |
| 2026-10-08 | 6 | container: hardened run | read-only root, cap-drop ALL, no-new-privileges | 7 checks | 0 | Frontend + JS served, anonymous sees Review Mode only, 401 on state change, cookie `HttpOnly; Secure; SameSite=Strict`, headers on static |
| 2026-10-08 | 6 | container: browser under production CSP | headless Edge against the container | 11 checks | 0 | **0 CSP violations**, 0 console errors; sign-in, notice gate, Delete All Data, demo restored, sign-out |
| 2026-10-08 | 6 | container: persistence | `docker restart` | 1 | 0 | Deletion record survives restart, seed does not re-run, WAL mode on the volume |
| 2026-10-08 | 6 | container: data-dir ownership | root-owned bind mount, then `chown 1000:1000` | 2 | 0 | Root-owned → exits `unable to open database file`; chowned → healthy, HTTP 200, Docker HEALTHCHECK healthy. First attempt used a named volume and was invalid (L-22) |
| 2026-10-08 | 7 | fresh-clone quickstart | `git clone` → `npm install` → `npm test` → `npm run dev:api` / `dev:web` | 5 | 0 | Install, 183 tests, API, Review Mode via proxy, dev login all work. **README URL `127.0.0.1:5173` failed** — Vite listens on IPv6; fixed to `localhost` (L-27) |
| 2026-10-08 | 5 | AI copilot foundation | `npm test` with a scripted fake model | 26 | 0 | Read-only allowlist, run scoping, untrusted wrapping, sanitising, trace, step limit, output guard, **fully-obeyed injection changes nothing and its false claim is withheld**, HTTP route, saved notes, privacy wording |
| 2026-10-08 | 5 | AI mutation testing | scripted, 6 mutations | 6 caught | 0 missed | Output guard, tool allowlist, operator text in instruction, untrusted wrapping, saving withheld notes, step limit |
| 2026-10-08 | 5 | browser: copilot panel | headless Edge, `localhost`, 390px | 3 checks | 0 | Anonymous: next actions, no generate button. Signed in: honest "not enabled" message. Only console error is that intentional 503 |
| 2026-10-09 | 5 | zod 3 → 4 upgrade | `npm test` | 209 | 0 | Required by the Strands peer dependency; one API rename; validation-echo test still passes |
| 2026-10-09 | 5 | AI runtimes (Strands + Converse) | `npm test`, real Strands loop + scripted model, stubbed Bedrock client | 38 | 0 | Prompt/instruction/tool set reach the model unchanged; untrusted placement; write tool refused; output guard on both paths; step limit; hard timeout on a stalled provider; error classification incl. cause chains; config; HTTP 503 path with readiness unchanged |
| 2026-10-09 | 5 | AI runtime mutation testing | scripted, 7 mutations | 7 caught | 0 missed | **First run missed one** — the fake runtime pre-sanitised its error, so raw AWS text in logs went undetected. Test fixed (L-29) |
| 2026-10-09 | 5 | real SDK, no credentials | built server + `npm run ai:smoke`, AI configured, no AWS credentials | 2 | 0 | Real BedrockModel + AWS SDK credential chain → `503 NO_CREDENTIALS` in ~3 s; log holds the kind only. **Not** evidence that Bedrock access works |
| — | 5 | T9 / T10 real Bedrock | `npm run ai:smoke` | — | — | **BLOCKED** — AWS account access unavailable (B-002) |

## Totals

**247 automated tests, 0 failing** (15 suites), plus browser walkthroughs, container checks and mutation
checks on the security guards (6/6) and the AI defences (6/6 + 7/7).

## What these results do not prove

- **Pagination** is proven against SYNTHETIC multi-page fixtures only; real provider pagination
  remains unverified (T4, R-004).
- The browser live flow uses a **test-only fake Ring server** serving the measured Day-1 shapes. It
  proves our UI and pipeline, not Ring's behaviour.
- **Bedrock (T9) and Strands (T10)** have not been executed — no AWS account access (B-002). The AI
  tests use a scripted fake model: they prove the defences around a model, not any model's behaviour.
- **Nothing has been deployed to AWS.** Container behaviour is verified locally in Docker Desktop.

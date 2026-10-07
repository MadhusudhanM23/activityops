# Test results

| Date | Phase | Suite | Command | Passed | Failed | Notes |
|------|-------|-------|---------|--------|--------|-------|
| 2026-10-07 | 0 | api smoke | `npm test` | 1 | 0 | Health route; asserts integration state is exposed separately from readiness |
| 2026-10-07 | 0 | api boot | `PORT=3177 tsx src/server.ts` + curl | 1 | 0 | GET /api/health returned HTTP 200. Bind host made configurable after EACCES on 0.0.0.0 |
| 2026-10-07 | 0 | web build | `npm run build -w apps/web` | 1 | 0 | Vite production build succeeds |
| 2026-10-07 | 0 | sqlite | PRAGMA journal_mode | 1 | 0 | Returns `wal` |
| 2026-10-07 | 2 | attempts + evidence gate | `npm test` | 19 | 0 | Session gating, sec. 8.4 window bounds, device/type/ambiguity binding, one-to-one claim, immutability triggers, override |
| 2026-10-07 | 2 | readiness precedence | `npm test` | 20 | 0 | All six precedence rules, integration overlay vs coverage, blocking severities, forbidden-wording assertion |
| 2026-10-07 | 2 | incident lifecycle | `npm test` | 14 | 0 | One-open-incident, escalation, illegal transitions, dismissal deadlock, approval/cancel, audit trail |
| 2026-10-07 | 2 | sync coverage gating | `npm test` | 8 | 0 | Case A vs Case B blockers through the database; UNKNOWN device and integration failure both proven non-blocking |
| 2026-10-07 | 1 | Ring Playground T1-T8 | live API calls | 3 pass, 1 partial, 2 inconclusive/not-reproduced, 2 blocked | — | Real provider calls. Verdict `DAY-1 GATE: PARTIAL`. See `INTEGRATION_FINDINGS.md` |
| 2026-10-07 | 3 | ring normalization | `npm test` | 14 | 0 | Measured JSON:API envelope, epoch-ms conversion, relationships.source binding, authoritative client-side filter |
| 2026-10-07 | 3 | ring error classification | `npm test` | 15 | 0 | Both measured 403 codes map to REQUEST_INVALID; 401/429/5xx raise the overlay; no error is ever negative evidence |
| 2026-10-07 | 3 | ring history sync | `npm test` | 14 | 0 | Traversal, repeated-URL abort, page cap, idempotent upsert, coverage both-conditions, real-payload end-to-end |

**105 tests total, 0 failing.** Pagination traversal is proven against SYNTHETIC multi-page
fixtures only — real provider pagination remains unverified (T4).
| 2026-10-07 | 4 | HTTP routes | `npm test` | 21 | 0 | Review Mode, Live Test connect, token never echoed/persisted, full fail->recheck->resolve->approve, sync failure isolation, recorded-run immutability |
| 2026-10-07 | 4 | frontend wording gate | `npm test` | 9 | 0 | Scans apps/web/src for forbidden claims and browser-storage use; self-tests prove the scanner catches real use |
| 2026-10-07 | 4 | browser: Review Mode | Edge headless, 390px + 1280px | 6 shots | 0 | No horizontal overflow at either width; 5 visual defects found and fixed (see LESSONS_LEARNED L-17) |
| 2026-10-07 | 4 | browser: live end-to-end | Edge headless, test-only fake Ring server | 1 flow | 0 | NOT_STARTED -> PASS locked -> unlocked after sync -> FAIL -> recheck -> READY_TO_APPROVE -> READY. 0 console errors, 0 media calls, token absent from API log |
| 2026-10-07 | 4 | built-artifact boot | `node dist/server.js` | 1 | 0 | Initially FAILED: schema.sql missing from dist (L-10). Fixed; built server boots, seeds and serves Review Mode |

**135 automated tests, 0 failing**, plus browser walkthroughs. The browser live flow uses a
test-only fake Ring server that serves the measured Day-1 shapes; it is not provider evidence.

Bedrock (T9) and Strands (T10) have not been executed — no AWS account access yet (B-002).
Ring results are real observations; failures and inconclusive results are recorded as such.

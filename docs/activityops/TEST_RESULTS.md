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

Bedrock (T9) and Strands (T10) have not been executed — no AWS account access yet (B-002).
Ring results are real observations; failures and inconclusive results are recorded as such.

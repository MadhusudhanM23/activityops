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

No Ring or Bedrock tests have been executed yet. Phase 1 records real results — including failures
— in `INTEGRATION_FINDINGS.md`.

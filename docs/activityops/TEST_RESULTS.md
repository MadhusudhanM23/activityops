# Test results

| Date | Phase | Suite | Command | Passed | Failed | Notes |
|------|-------|-------|---------|--------|--------|-------|
| 2026-10-07 | 0 | api smoke | `npm test` | 1 | 0 | Health route; asserts integration state is exposed separately from readiness |
| 2026-10-07 | 0 | api boot | `PORT=3177 tsx src/server.ts` + curl | 1 | 0 | GET /api/health returned HTTP 200. Bind host made configurable after EACCES on 0.0.0.0 |
| 2026-10-07 | 0 | web build | `npm run build -w apps/web` | 1 | 0 | Vite production build succeeds |
| 2026-10-07 | 0 | sqlite | PRAGMA journal_mode | 1 | 0 | Returns `wal` |

No Ring or Bedrock tests have been executed yet. Phase 1 records real results — including failures
— in `INTEGRATION_FINDINGS.md`.

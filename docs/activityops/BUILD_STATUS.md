# Build status

Statuses: `NOT_STARTED` `IN_PROGRESS` `BLOCKED` `READY_FOR_REVIEW` `PASS` `FAIL` `DEFERRED`

A phase becomes `PASS` only when its acceptance criteria **and** required tests are satisfied —
never because code was written.

| Phase | Status | Owner | Started | Completed | Tests | Evidence | Blockers |
|-------|--------|-------|---------|-----------|-------|----------|----------|
| Phase 0 — Foundation | PASS | Lead | 2026-10-07 | 2026-10-07 | 1 passing + boot check | `docs/activityops/*`, workspaces build | none |
| Phase 1 — Day-1 gate | BLOCKED | Ring + AI/AWS | | | | `evidence/day-1/` | Needs Ring Playground token + AWS account access (B-001, B-002) |
| Phase 2 — Domain model | NOT_STARTED | Backend | | | | | Waits on Phase 1 verdict |
| Phase 3 — Ring evidence pipeline | NOT_STARTED | Ring | | | | | Waits on Phase 1 verdict |
| Phase 4 — Core product UI | NOT_STARTED | Frontend | | | | | Waits on Phase 2/3 |
| Phase 5 — AI operations agent | NOT_STARTED | AI/AWS | | | | | Waits on T9 Bedrock access |
| Phase 6 — Security / privacy / deploy | NOT_STARTED | QA/DevOps | | | | | |
| Phase 7 — Judge experience | NOT_STARTED | Lead | | | | | |

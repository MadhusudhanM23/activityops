# Build status

Statuses: `NOT_STARTED` `IN_PROGRESS` `BLOCKED` `READY_FOR_REVIEW` `PASS` `FAIL` `DEFERRED`, plus
`PARTIAL` used only for the Day-1 gate verdict (spec sec. 21 asks for PASS / PARTIAL / BLOCKED).

A phase becomes `PASS` only when its acceptance criteria **and** required tests are satisfied —
never because code was written.

| Phase | Status | Owner | Started | Completed | Tests | Evidence | Blockers |
|-------|--------|-------|---------|-----------|-------|----------|----------|
| Phase 0 — Foundation | PASS | Lead | 2026-10-07 | 2026-10-07 | 1 passing + boot check | `docs/activityops/*`, workspaces build | none |
| Phase 1 — Day-1 gate | PARTIAL | Ring + AI/AWS | 2026-10-07 | 2026-10-07 (Ring part) | T1-T8 run | `evidence/day-1/T*.md` + 3 redacted captures | T5/T8 blocked by offline device (B-005); T9/T10 by AWS (B-002) |
| Phase 2 — Domain model | PASS | Backend | 2026-10-07 | 2026-10-07 | 61 passing | `schema.sql`, `src/domain/*`, 4 suites | none |
| Phase 3 — Ring evidence pipeline | PASS | Ring | 2026-10-07 | 2026-10-07 | 43 passing | `src/ring/*`, 3 suites, fixtures from the real capture | Provider pagination unverified (R-004) |
| Phase 4 — Core product UI | PASS | Frontend | 2026-10-07 | 2026-10-07 | 135 passing + browser e2e | routes, workflow, Review Mode seed, React UI, screenshots | none (R-005 closed in Phase 6a) |
| Phase 5 — AI operations agent | IN_PROGRESS | AI/AWS | 2026-10-08 | | 64 AI tests; 13/13 mutations caught; real SDK no-credentials path checked | `src/ai/*` incl. Strands runtime + Bedrock Converse fallback, `scripts/ai-smoke.ts` | Implemented; **not yet run against real Bedrock** — T9/T10 need AWS access (B-002) |
| Phase 6a — Security, privacy, container | PASS | QA/DevOps | 2026-10-07 | 2026-10-08 | 183 passing; 6/6 mutations caught; container + browser checks | `src/security/*`, `src/http/security.ts`, `Dockerfile`, `docker-compose.yml`, `deploy/` | none |
| Phase 6b — EC2 + EBS deployment | BLOCKED | QA/DevOps | 2026-10-08 | | Runbook steps verified in local Docker | `deploy/README.md` | No AWS account (B-002) |
| Phase 7 — Judge experience | IN_PROGRESS | Lead | 2026-10-08 | | Fresh-clone quickstart verified | `README.md`, `FRICTION_LOG.md`, `PRODUCT_FEEDBACK.md`, `DEMO_SCRIPT.md`, `ORGANIZER_QUESTIONS.md` | No hosted URL (B-002); no push (B-004); AI handover absent from Review Mode (B-002); forum questions unposted (B-003, B-005) |

# Changelog

## 2026-10-07 — Phase 0 (foundation)
- Initialized git repository and an npm workspaces monorepo.
- Added `apps/api`: Fastify + TypeScript + better-sqlite3 + Vitest, health route, one test.
- Added `apps/web`: React + TypeScript + Vite + Tailwind placeholder — no product UI by design.
- Added a configuration module exposing the spec sec. 8 timing values as environment configuration.
- Added `.env.example` with no real secrets; `.gitignore` excludes env files and SQLite artifacts.
- Created the `docs/activityops/` record system and the `evidence/day-1/` folder.
- Added `.coderabbit.yaml` with spec-derived review instructions, and a GitHub Actions CI workflow
  running typecheck and tests.

### Corrections made during Phase 0
- `better-sqlite3` replaced with the built-in `node:sqlite` driver after a real install failure
  (no Node 24 prebuild, no Visual Studio toolchain on the build machine). See DECISIONS.md D-002.

## 2026-10-07 — Phase 1 preparation
- Added docs/activityops/DAY1_RUNBOOK.md with the T1-T10 procedure and the Ring endpoint paths
  read from the official Partner API documentation, explicitly marked unvalidated until T2/T3.
- Added scripts/redact.mjs (tested) so raw captures can be committed as public evidence with
  tokens destroyed and identifiers replaced by stable aliases.
- Added evidence/day-1/T1..T10 templates with the required reporting fields.
- Recorded D-007 (user runs T1-T8; no token enters the agent session), D-008 (endpoint paths are
  documentation-derived), D-009 (public repo + CodeRabbit as the review gate).

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
